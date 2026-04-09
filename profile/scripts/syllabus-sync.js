(function () {
  const SUBJECTS = {
    "0450": { slug: "business-studies-0450", name: "Business Studies" },
    "0452": { slug: "accounting-0452", name: "Accounting" },
    "0455": { slug: "economics-0455", name: "Economics" },
    "0266": { slug: "psychology-0266", name: "Psychology" },
    "0478": { slug: "computer-science-0478", name: "Computer Science" },
    "0495": { slug: "sociology-0495", name: "Sociology" },
    "0500": { slug: "english-first-language-0500", name: "English Language" },
    "0510": { slug: "english-as-a-second-language-0510", name: "English as a Second Language" },
    "0580": { slug: "mathematics-0580", name: "Mathematics" },
    "0610": { slug: "biology-0610", name: "Biology" },
    "0620": { slug: "chemistry-0620", name: "Chemistry" },
    "0625": { slug: "physics-0625", name: "Physics" }
  };

  const STATUS_CYCLE = {
    not_started: "in_progress",
    in_progress: "completed",
    completed: "not_started"
  };

  let lastSignature = "";
  let mountScheduled = false;
  let transitionObserver = null;
  let subjectManagerObserver = null;
  let subjectManagerEnhanceScheduled = false;
  let remoteSyllabusDataSeen = false;
  const SUBJECTS_WITH_LEVELS = new Set(["0580", "0610", "0620", "0625"]);
  const PROFILE_PATCH_READY_EVENT = "igcsefy:profile-patch-ready";
  const PROFILE_PATCH_STATE_KEY = "__igcsefyProfilePatchReady";

  function markProfilePatchReady(step) {
    let state = window[PROFILE_PATCH_STATE_KEY];

    if (!state || typeof state !== "object") {
      state = {};
      window[PROFILE_PATCH_STATE_KEY] = state;
    }

    if (!step || state[step]) return;

    state[step] = true;

    try {
      window.dispatchEvent(new CustomEvent(PROFILE_PATCH_READY_EVENT, {
        detail: { step }
      }));
    } catch (error) {}
  }

  function ensureIgcsefyDataStore() {
    if (typeof window === "undefined") {
      return {
        getSnapshot() { return {}; },
        getRequestedLevel() { return ""; },
        getSubjectLevel(_subject, fallback) { return fallback || "core"; },
        setSubjectLevel() { return {}; },
        setTrackedSubjects() { return {}; },
        getSyllabusStates() { return {}; },
        setSyllabusStates() { return {}; },
        getSyllabusState() { return "not_started"; },
        setSyllabusState() { return {}; },
        getPastPaperStatuses() { return {}; },
        setPastPaperStatuses() { return {}; },
        getPastPaperStatus() { return "none"; },
        setPastPaperStatus() { return {}; },
        replaceSnapshot() { return {}; }
      };
    }

    if (window.igcsefyDataStore) {
      return window.igcsefyDataStore;
    }

    const CHANGE_EVENT = "igcsefy:data-change";
    const ADAPTER_READY_EVENT = "igcsefy:data-adapter-ready";
    const LEVELS = new Set(["core", "extended"]);
    const SYLLABUS_STATES = new Set(["in_progress", "completed"]);
    const PAST_PAPER_STATES = new Set(["in_progress", "done", "reviewed"]);

    let snapshot = createEmptySnapshot();
    let remoteSaveTimer = 0;
    let remoteLoadStarted = false;
    let remoteSubscribed = false;

    function clone(value) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (error) {
        return value;
      }
    }

    function cleanRecord(record, allowedValues) {
      const next = {};
      if (!record || typeof record !== "object" || Array.isArray(record)) return next;
      Object.keys(record).forEach((key) => {
        const value = record[key];
        if (allowedValues.has(value)) {
          next[String(key)] = value;
        }
      });
      return next;
    }

    function normalizeTrackedSubjects(subjects) {
      if (!Array.isArray(subjects)) return [];

      const seen = new Set();
      return subjects.map((subject) => {
        const code = String(subject && subject.code ? subject.code : "").trim();
        const slug = String(subject && subject.slug ? subject.slug : "").trim();
        const name = String(subject && subject.name ? subject.name : code || slug).trim();
        const key = slug || code;

        if (!key || seen.has(key)) return null;
        seen.add(key);

        const entry = {
          code,
          slug,
          name: name || code || slug
        };

        if (subject && subject.hasDistinctLevels) {
          entry.hasDistinctLevels = true;
        }

        if (subject && LEVELS.has(subject.level)) {
          entry.level = subject.level;
        }

        return entry;
      }).filter(Boolean);
    }

    function normalizeSubjectPreferences(preferences) {
      const next = {};
      if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) return next;

      Object.keys(preferences).forEach((key) => {
        const value = preferences[key];
        if (!value || typeof value !== "object" || !LEVELS.has(value.level)) return;
        next[String(key)] = {
          level: value.level,
          updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null
        };
      });

      return next;
    }

    function normaliseSnapshot(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return createEmptySnapshot();
      }

      return {
        trackedSubjects: normalizeTrackedSubjects(input.trackedSubjects),
        subjectPreferences: normalizeSubjectPreferences(input.subjectPreferences),
        syllabusTopicStates: cleanRecord(input.syllabusTopicStates, SYLLABUS_STATES),
        pastPaperStatuses: cleanRecord(input.pastPaperStatuses, PAST_PAPER_STATES),
        updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null
      };
    }

    function createEmptySnapshot() {
      return {
        trackedSubjects: [],
        subjectPreferences: {},
        syllabusTopicStates: {},
        pastPaperStatuses: {},
        updatedAt: null
      };
    }

    function serialiseSnapshot(input) {
      const normalized = normaliseSnapshot(input);
      normalized.updatedAt = null;
      return JSON.stringify(normalized);
    }

    function emitStoreChange(reason, meta) {
      try {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
          detail: {
            reason,
            meta: meta || null,
            snapshot: clone(snapshot)
          }
        }));
      } catch (error) {}
    }

    function resolveAdapter() {
      return window.igcsefyDataStoreAdapter || null;
    }

    function scheduleRemoteSave(reason) {
      const adapter = resolveAdapter();
      if (!adapter || typeof adapter.save !== "function") return;

      if (remoteSaveTimer) {
        window.clearTimeout(remoteSaveTimer);
      }

      remoteSaveTimer = window.setTimeout(async () => {
        try {
          await adapter.save(clone(snapshot), { reason });
        } catch (error) {
          console.error("IGCSEfy data sync failed:", error);
        }
      }, 160);
    }

    function setSnapshot(nextSnapshot, reason, options) {
      const normalized = normaliseSnapshot(nextSnapshot);
      if (serialiseSnapshot(snapshot) === serialiseSnapshot(normalized)) {
        return clone(snapshot);
      }

      snapshot = normalized;
      snapshot.updatedAt = new Date().toISOString();
      emitStoreChange(reason, options && options.meta);

      if (!(options && options.skipRemote)) {
        scheduleRemoteSave(reason);
      }

      return clone(snapshot);
    }

    function updateSnapshot(mutator, reason, options) {
      const draft = clone(snapshot);
      mutator(draft);
      return setSnapshot(draft, reason, options);
    }

    function getSubjectKey(subject) {
      if (subject && typeof subject === "object") {
        const slug = String(subject.slug || subject.subjectSlug || "").trim();
        if (slug) return slug;
        const code = String(subject.code || "").trim();
        if (code) return code;
      }
      return String(subject || "").trim();
    }

    function getSubjectPreferenceKeys(subject) {
      const keys = [];
      if (subject && typeof subject === "object") {
        const slug = String(subject.slug || subject.subjectSlug || "").trim();
        const code = String(subject.code || "").trim();
        if (slug) keys.push(slug);
        if (code && !keys.includes(code)) keys.push(code);
        return keys;
      }
      const value = String(subject || "").trim();
      return value ? [value] : [];
    }

    function getStoredSubjectPreference(subjectPreferences, subject) {
      const keys = getSubjectPreferenceKeys(subject);
      for (const key of keys) {
        const preferred = subjectPreferences[key];
        if (preferred && LEVELS.has(preferred.level)) {
          return preferred;
        }
      }
      return null;
    }

    function applyTrackedSubjectPreferences(subjects, subjectPreferences) {
      return normalizeTrackedSubjects(subjects).map((subject) => {
        const preferred = getStoredSubjectPreference(subjectPreferences, subject);
        if (preferred) {
          return Object.assign({}, subject, { level: preferred.level });
        }
        return subject;
      });
    }

    function getRequestedLevel() {
      try {
        const params = new URLSearchParams(window.location.search || "");
        const value = String(params.get("level") || "").toLowerCase().trim();
        return LEVELS.has(value) ? value : "";
      } catch (error) {
        return "";
      }
    }

    function initRemote() {
      const adapter = resolveAdapter();
      if (!adapter) return;

      if (!remoteLoadStarted && typeof adapter.load === "function") {
        remoteLoadStarted = true;
        Promise.resolve(adapter.load())
          .then((remoteSnapshot) => {
            if (remoteSnapshot) {
              applyRemoteSnapshot(remoteSnapshot, "remote-load");
            }
          })
          .catch((error) => {
            remoteLoadStarted = false;
            console.error("IGCSEfy remote load failed:", error);
          });
      }

      if (!remoteSubscribed && typeof adapter.subscribe === "function") {
        remoteSubscribed = true;
        try {
          adapter.subscribe((remoteSnapshot) => {
            if (remoteSnapshot) {
              applyRemoteSnapshot(remoteSnapshot, "remote-update");
            }
          });
        } catch (error) {
          remoteSubscribed = false;
          console.error("IGCSEFy remote subscription failed:", error);
        }
      }
    }

    window.addEventListener(ADAPTER_READY_EVENT, initRemote);

    const api = {
      getSnapshot() {
        initRemote();
        return clone(snapshot);
      },
      getRequestedLevel,
      getSubjectLevel(subject, fallback) {
        initRemote();
        const requestedLevel = getRequestedLevel();
        if (requestedLevel) return requestedLevel;

        const preferred = getStoredSubjectPreference(snapshot.subjectPreferences, subject);
        return preferred ? preferred.level : (fallback || "core");
      },
      replaceSnapshot(nextSnapshot, reason, options) {
        return applyRemoteSnapshot(nextSnapshot, reason || "remote-update", options);
      },
      setSubjectLevel(subject, level) {
        if (!LEVELS.has(level)) return clone(snapshot);
        const keys = getSubjectPreferenceKeys(subject);
        if (!keys.length) return clone(snapshot);

        const existing = getStoredSubjectPreference(snapshot.subjectPreferences, subject);
        if (existing && existing.level === level) {
          return clone(snapshot);
        }

        return updateSnapshot((draft) => {
          const updatedAt = new Date().toISOString();
          keys.forEach((key) => {
            draft.subjectPreferences[key] = { level, updatedAt };
          });
          draft.trackedSubjects = draft.trackedSubjects.map((item) => {
            const itemKeys = getSubjectPreferenceKeys(item);
            return itemKeys.some((key) => keys.includes(key)) ? Object.assign({}, item, { level }) : item;
          });
        }, "subject-level", { meta: { subjectKey: keys[0], level } });
      },
      setTrackedSubjects(subjects) {
        const normalizedSubjects = applyTrackedSubjectPreferences(subjects, snapshot.subjectPreferences);

        return updateSnapshot((draft) => {
          draft.trackedSubjects = normalizedSubjects;
          const allowedKeys = new Set();
          normalizedSubjects.forEach((subject) => {
            getSubjectPreferenceKeys(subject).forEach((key) => allowedKeys.add(key));
          });
          Object.keys(draft.subjectPreferences).forEach((key) => {
            if (!allowedKeys.has(key)) {
              delete draft.subjectPreferences[key];
            }
          });
        }, "tracked-subjects", { meta: { total: normalizedSubjects.length } });
      },
      getSyllabusStates() {
        initRemote();
        return Object.assign({}, snapshot.syllabusTopicStates);
      },
      setSyllabusStates(nextStates) {
        return updateSnapshot((draft) => {
          draft.syllabusTopicStates = cleanRecord(nextStates, SYLLABUS_STATES);
        }, "syllabus-states");
      },
      getSyllabusState(topicKey) {
        initRemote();
        return snapshot.syllabusTopicStates[topicKey] || "not_started";
      },
      setSyllabusState(topicKey, state) {
        const key = String(topicKey || "").trim();
        if (!key) return clone(snapshot);

        return updateSnapshot((draft) => {
          if (!SYLLABUS_STATES.has(state)) {
            delete draft.syllabusTopicStates[key];
            return;
          }
          draft.syllabusTopicStates[key] = state;
        }, "syllabus-topic", { meta: { topicKey: key, state: state || "not_started" } });
      },
      getPastPaperStatuses() {
        initRemote();
        return Object.assign({}, snapshot.pastPaperStatuses);
      },
      setPastPaperStatuses(nextStatuses) {
        const normalizedStatuses = cleanRecord(nextStatuses, PAST_PAPER_STATES);
        const nextSnapshot = updateSnapshot((draft) => {
          draft.pastPaperStatuses = normalizedStatuses;
        }, "past-paper-statuses", { meta: { total: Object.keys(normalizedStatuses).length } });

        try {
          window.dispatchEvent(new CustomEvent("igcsefy:tracker-change", {
            detail: {
              store: Object.assign({}, nextSnapshot.pastPaperStatuses || {})
            }
          }));
        } catch (error) {}

        return nextSnapshot;
      },
      getPastPaperStatus(trackKey) {
        initRemote();
        return snapshot.pastPaperStatuses[trackKey] || "none";
      },
      setPastPaperStatus(trackKey, status) {
        const key = String(trackKey || "").trim();
        if (!key) return clone(snapshot);

        const nextSnapshot = updateSnapshot((draft) => {
          if (!PAST_PAPER_STATES.has(status)) {
            delete draft.pastPaperStatuses[key];
            return;
          }
          draft.pastPaperStatuses[key] = status;
        }, "past-paper-status", { meta: { trackKey: key, status: status || "none" } });

        try {
          window.dispatchEvent(new CustomEvent("igcsefy:tracker-change", {
            detail: {
              store: Object.assign({}, nextSnapshot.pastPaperStatuses || {})
            }
          }));
        } catch (error) {}

        return nextSnapshot;
      }
    };

    function applyRemoteSnapshot(remoteSnapshot, reason, options) {
      if (!remoteSnapshot) {
        return clone(snapshot);
      }

      const normalized = normaliseSnapshot(remoteSnapshot);
      const subjectPreferences = normalizeSubjectPreferences(normalized.subjectPreferences);

      return setSnapshot({
        trackedSubjects: applyTrackedSubjectPreferences(normalized.trackedSubjects, subjectPreferences),
        subjectPreferences,
        syllabusTopicStates: Object.assign({}, normalized.syllabusTopicStates),
        pastPaperStatuses: Object.assign({}, normalized.pastPaperStatuses),
        updatedAt: normalized.updatedAt || null
      }, reason, { skipRemote: true });
    }

    window.igcsefyDataStore = api;
    initRemote();
    return api;
  }

  const dataStore = ensureIgcsefyDataStore();

  function escapeSelector(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/"/g, '\\"');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getContentRoot() {
    return Array.from(document.querySelectorAll("#root .max-w-5xl"))
      .find((node) => String(node.className || "").includes("py-10"));
  }

  function getMountedHost(root) {
    return root ? root.querySelector(":scope > .igcsefy-profile-syllabus-host") : null;
  }

  function isLightTheme() {
    return document.documentElement.classList.contains("light");
  }

  function getSyllabusTheme() {
    if (isLightTheme()) {
      return {
        tabActive: "rgb(0, 0, 0)",
        chevron: "#666666",
        sectionTrack: "#E9E3D8",
        sectionFill: "#8E7A63",
        sectionProgress: "#CDBDA7",
        sectionBorder: "#E9E3D8",
        progressFill: "#8E7A63",
        percent: "#746A5E",
        subjectPercent: "#746A5E",
        subjectHover: "#F1EFE7",
        sectionHover: "#F1EFE7"
      };
    }

    return {
      tabActive: "rgb(236, 234, 221)",
      chevron: "#2A2A2A",
      sectionTrack: "#1A1A1A",
      sectionFill: "#ECEADD",
      sectionProgress: "#2E2E2E",
      sectionBorder: "#141414",
      progressFill: "#ECEADD",
      percent: "#333",
      subjectPercent: "#555",
      subjectHover: "#111111",
      sectionHover: "#131313"
    };
  }

  function isActiveTabButton(button) {
    if (!button) return false;
    if (button.getAttribute("data-igcsefy-profile-tab-state") === "active") return true;
    const style = button.getAttribute("style") || "";
    if (style.includes("border-bottom: 1px solid transparent") || style.includes("border-bottom: 2px solid transparent")) {
      return false;
    }
    return (
      style.includes("rgb(236, 234, 221)") ||
      style.includes("rgb(0, 0, 0)") ||
      style.includes("rgb(31, 26, 20)")
    );
  }

  function extractSelectedCodes(root) {
    const codes = Array.from(root.querySelectorAll("*"))
      .map((node) => (node.textContent || "").trim())
      .filter((text) => /^\d{4}$/.test(text) && SUBJECTS[text]);
    return Array.from(new Set(codes));
  }

  function isSyllabusTabVisible() {
    const buttons = Array.from(document.querySelectorAll("#root button"));
    const syllabusTab = buttons.find((button) => (button.textContent || "").trim() === "Syllabus");
    return isActiveTabButton(syllabusTab);
  }

  function isSubjectsTabVisible() {
    const buttons = Array.from(document.querySelectorAll("#root button"));
    const subjectsTab = buttons.find((button) => (button.textContent || "").trim() === "Subjects");
    return isActiveTabButton(subjectsTab);
  }

  function extractSubjectButtonCode(button) {
    if (!button) return "";
    const matches = Array.from(button.querySelectorAll("*"))
      .map((node) => (node.textContent || "").trim())
      .filter((text) => /^\d{4}$/.test(text));
    return matches.find((code) => SUBJECTS[code]) || "";
  }

  function isSubjectButtonSelected(button) {
    if (!button) return false;
    return Boolean(button.querySelector("svg path[d='M1 3.5L3.5 6L8 1']"));
  }

  function setLevelPickerState(host, level) {
    if (!host) return;
    host.querySelectorAll("[data-level-value]").forEach((button) => {
      const active = button.getAttribute("data-level-value") === level;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function createLevelPicker(subject, level) {
    const host = document.createElement("div");
    host.className = "igcsefy-profile-subject-picker__levels";
    host.setAttribute("data-igcsefy-level-picker", subject.code);
    host.innerHTML = `
      <span class="igcsefy-profile-subject-picker__level-chip" data-level-value="core" aria-pressed="false">Core</span>
      <span class="igcsefy-profile-subject-picker__level-chip" data-level-value="extended" aria-pressed="false">Extended</span>
    `;

    host.addEventListener("click", (event) => {
      const chip = event.target && event.target.closest ? event.target.closest("[data-level-value]") : null;
      if (!chip) return;
      event.preventDefault();
      event.stopPropagation();
      const nextLevel = chip.getAttribute("data-level-value") || "core";
      dataStore.setSubjectLevel(subject, nextLevel);
      setLevelPickerState(host, nextLevel);
    });

    setLevelPickerState(host, level);
    return host;
  }

  function enhanceSubjectManager() {
    if (!isSubjectsTabVisible()) return;
    const searchInput = document.querySelector('#root input[placeholder="Search subjects…"], #root input[placeholder="Search subjects..."]');
    if (!searchInput) return;

    const modal = searchInput.closest("div.rounded-xl");
    if (!modal) return;

    const buttons = Array.from(modal.querySelectorAll("button"))
      .filter((button) => extractSubjectButtonCode(button));

    buttons.forEach((button) => {
      const code = extractSubjectButtonCode(button);
      const supportLevels = SUBJECTS_WITH_LEVELS.has(code);
      const middle = button.children[1];
      if (!middle || !(middle instanceof HTMLElement)) return;

      const existing = middle.querySelector(`[data-igcsefy-level-picker="${code}"]`);
      const selected = isSubjectButtonSelected(button);

      if (!supportLevels || !selected) {
        if (existing) existing.remove();
        return;
      }

      const subject = {
        code,
        slug: SUBJECTS[code] ? SUBJECTS[code].slug : "",
        name: SUBJECTS[code] ? SUBJECTS[code].name : ""
      };
      const level = dataStore.getSubjectLevel(subject, "core");

      if (existing) {
        setLevelPickerState(existing, level);
        return;
      }

      const host = createLevelPicker(subject, level);
      middle.appendChild(host);
    });
  }

  function scheduleSubjectManagerEnhancement() {
    if (subjectManagerEnhanceScheduled) return;
    subjectManagerEnhanceScheduled = true;
    window.setTimeout(() => {
      subjectManagerEnhanceScheduled = false;
      enhanceSubjectManager();
    }, 60);
  }

  function normaliseUiState(uiState) {
    return {
      expandedSubjects: uiState && uiState.expandedSubjects instanceof Set ? new Set(uiState.expandedSubjects) : new Set(),
      expandedSections: uiState && uiState.expandedSections instanceof Set ? new Set(uiState.expandedSections) : new Set()
    };
  }

  function captureUiState(root) {
    return {
      expandedSubjects: new Set(
        Array.from(root.querySelectorAll("[data-subject-toggle][aria-expanded='true']"))
          .map((button) => button.getAttribute("data-subject-toggle"))
          .filter(Boolean)
      ),
      expandedSections: new Set(
        Array.from(root.querySelectorAll("[data-section-toggle][aria-expanded='true']"))
          .map((button) => button.getAttribute("data-section-toggle"))
          .filter(Boolean)
      )
    };
  }

  function stripTopicCode(title) {
    const value = String(title || "").trim();
    return value.replace(/^\d+(?:\.\d+)*\.?\s*/, "").trim() || value;
  }

  function extractTopicCode(title) {
    const value = String(title || "").trim();
    const match = value.match(/^(\d+(?:\.\d+)*)\.?\s*/);
    return match ? match[1] : "";
  }

  function normaliseSyllabusPoint(text) {
    return String(text || "")
      .replace(/^[•–—-]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getRenderableTopicTitle(topic) {
    if (!topic || typeof topic !== "object") {
      return stripTopicCode(topic);
    }
    return String(topic.title || "").trim() || "Topic";
  }

  function stripSectionCode(title) {
    const value = String(title || "").trim();
    return value.replace(/^\d+\.?\s+/, "").trim() || value;
  }

  function getTopicStateLabel(state) {
    return state === "completed" ? "done" : state === "in_progress" ? "active" : "";
  }

  function renderTopicMarker(state) {
    if (state === "completed") {
      return [
        '<svg class="igcsefy-profile-syllabus__topic-check" viewBox="0 0 12 10" aria-hidden="true" focusable="false">',
        '<path d="M1.75 5.25L4.6 8.1L10.2 2.4" pathLength="1" />',
        "</svg>"
      ].join("");
    }

    if (state === "in_progress") {
      return '<span class="igcsefy-profile-syllabus__topic-dot"></span>';
    }

    return "";
  }

  function getSectionBarWidths(counts) {
    const total = counts.total || 0;
    if (!total) return { completed: 0, progress: 0 };
    return {
      completed: (counts.completed / total) * 100,
      progress: (counts.inProgress / total) * 100
    };
  }

  function getCounts(topicItems, states) {
    const total = topicItems.length;
    const completed = topicItems.filter((item) => states[item.key] === "completed").length;
    const inProgress = topicItems.filter((item) => states[item.key] === "in_progress").length;
    return {
      total,
      completed,
      inProgress,
      remaining: Math.max(total - completed - inProgress, 0)
    };
  }

  function normaliseLeafTopics(topics, sectionId) {
    if (!Array.isArray(topics)) return [];
    return topics.map((topic, index) => {
      if (typeof topic === "string") {
        return {
          id: `${sectionId}-topic-${index + 1}`,
          title: stripTopicCode(topic),
          code: extractTopicCode(topic),
          subtopics: []
        };
      }

      const topicId = String(topic && topic.id ? topic.id : `${sectionId}-topic-${index + 1}`);
      const title = String(topic && topic.title ? topic.title : `Topic ${index + 1}`).trim();
      const code = extractTopicCode(title);
      const subtopics = Array.isArray(topic && topic.subtopics)
        ? topic.subtopics.map(normaliseSyllabusPoint).filter(Boolean)
        : [];

      return {
        id: topicId,
        title: stripTopicCode(title),
        code,
        subtopics
      };
    });
  }

  function normaliseUnits(units) {
    if (!Array.isArray(units)) return [];
    return units.map((unit, index) => {
      const sectionId = String(unit && unit.id ? unit.id : `section-${index + 1}`);
      return {
        id: sectionId,
        title: String(unit && unit.title ? unit.title : `Section ${index + 1}`).trim(),
        topics: normaliseLeafTopics(unit && unit.topics, sectionId)
      };
    });
  }

  function serialiseUnits(units) {
    return JSON.stringify(
      units.map((section) => ({
        title: section.title,
        topics: Array.isArray(section.topics)
          ? section.topics.map((topic) => ({
            code: topic.code || "",
            title: topic.title,
            subtopics: Array.isArray(topic.subtopics) ? topic.subtopics : []
          }))
          : []
      }))
    );
  }

  function prepareSubjectLevels(data) {
    const core = normaliseUnits(
      Array.isArray(data && data.core) && data.core.length
        ? data.core
        : (Array.isArray(data && data.units) && data.units.length
          ? data.units
          : (Array.isArray(data && data.extended) ? data.extended : []))
    );

    const extendedCandidate = normaliseUnits(
      Array.isArray(data && data.extended) && data.extended.length
        ? data.extended
        : (Array.isArray(data && data.advanced) ? data.advanced : [])
    );

    const hasDistinctLevels = Boolean(
      core.length &&
      extendedCandidate.length &&
      serialiseUnits(core) !== serialiseUnits(extendedCandidate)
    );

    return {
      core,
      extended: hasDistinctLevels ? extendedCandidate : [],
      hasDistinctLevels
    };
  }

  function getActiveSubjectLevel(subject) {
    if (!subject || !subject.hasDistinctLevels) {
      return "core";
    }
    return dataStore.getSubjectLevel(subject, "core");
  }

  function getSubjectSections(subject, level) {
    if (!subject) return [];
    if (!subject.hasDistinctLevels) {
      return Array.isArray(subject.levels && subject.levels.core) ? subject.levels.core : [];
    }
    if (level === "extended" && Array.isArray(subject.levels && subject.levels.extended) && subject.levels.extended.length) {
      return subject.levels.extended;
    }
    return Array.isArray(subject.levels && subject.levels.core) ? subject.levels.core : [];
  }

  function buildTopicKey(subject, level, section, topic, index) {
    const subjectKey = subject && (subject.slug || subject.code) ? (subject.slug || subject.code) : "subject";
    return [
      subjectKey,
      level || "core",
      section && (section.id || section.title) ? (section.id || section.title) : "section",
      topic && topic.id ? topic.id : index
    ].join("::");
  }

  function flattenTopics(subject, level) {
    return getSubjectSections(subject, level).flatMap((section) => {
      const topics = Array.isArray(section.topics) ? section.topics : [];
      return topics.map((topic, index) => ({
        key: buildTopicKey(subject, level, section, topic, index),
        title: getRenderableTopicTitle(topic),
        sectionId: section.id || section.title,
        sectionTitle: section.title
      }));
    });
  }

  function flattenSectionTopics(subject, level, section) {
    const topics = Array.isArray(section && section.topics) ? section.topics : [];
    return topics.map((topic, index) => ({
      key: buildTopicKey(subject, level, section, topic, index)
    }));
  }

  function renderHeatmap(topicItems, states) {
    return topicItems.map((item) => {
      const state = states[item.key] || "not_started";
      const cls = state === "completed"
        ? "is-completed"
        : state === "in_progress"
          ? "is-progress"
          : "";
      return `<div class="igcsefy-profile-syllabus__heatmap-cell ${cls}" data-heatmap-key="${escapeHtml(item.key)}"></div>`;
    }).join("");
  }

  function renderTopicRows(subject, level, section, sectionKey, states) {
    const topics = Array.isArray(section.topics) ? section.topics : [];
    return topics.map((topic, index) => {
      const key = buildTopicKey(subject, level, section, topic, index);
      const state = states[key] || "not_started";
      const stateClass = state === "completed" ? "is-completed" : state === "in_progress" ? "is-progress" : "";
      return `
        <div class="igcsefy-profile-syllabus__topic ${stateClass} flex items-center justify-between px-5 py-[11px] cursor-pointer select-none transition-colors duration-100" data-topic-key="${escapeHtml(key)}" data-topic-state="${escapeHtml(state)}" data-subject-code="${escapeHtml(subject.code)}" data-subject-level="${escapeHtml(level)}" data-section-key="${escapeHtml(sectionKey)}">
          <div class="igcsefy-profile-syllabus__topic-main flex items-center gap-3.5 min-w-0">
            <span class="igcsefy-profile-syllabus__topic-marker flex-shrink-0 transition-all duration-200">${renderTopicMarker(state)}</span>
            <span class="igcsefy-profile-syllabus__topic-title text-[13px] truncate transition-colors duration-200">${escapeHtml(getRenderableTopicTitle(topic))}</span>
          </div>
          <span class="igcsefy-profile-syllabus__topic-state text-[10px] uppercase tracking-[0.1em] flex-shrink-0 ml-4 transition-colors duration-200">${getTopicStateLabel(state)}</span>
        </div>
      `;
    }).join("");
  }

  function renderSectionCards(subject, level, states, uiState) {
    const theme = getSyllabusTheme();
    const sections = getSubjectSections(subject, level);
    return sections.map((section, index) => {
      const sectionKey = `${subject.code}-${level}-${index}`;
      const expanded = uiState.expandedSections.has(sectionKey);
      const counts = getCounts(flattenSectionTopics(subject, level, section), states);
      const percentage = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
      const widths = getSectionBarWidths(counts);
      return `
        <div class="igcsefy-profile-syllabus__section" data-section-card="${escapeHtml(sectionKey)}">
          <div class="igcsefy-profile-syllabus__section-head flex items-center gap-4 px-5 py-4 cursor-pointer select-none transition-colors duration-100" data-section-toggle="${escapeHtml(sectionKey)}" aria-expanded="${expanded ? "true" : "false"}" role="button" tabindex="0">
            <div class="igcsefy-profile-syllabus__section-chevron flex-shrink-0 transition-transform duration-200" style="color:${theme.chevron};transform:${expanded ? "rotate(90deg)" : "none"}">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </div>
            <p class="igcsefy-profile-syllabus__section-title flex-1 text-[13px] font-medium min-w-0 truncate">${escapeHtml(stripSectionCode(section.title))}</p>
            <div class="igcsefy-profile-syllabus__section-meta flex items-center gap-4 flex-shrink-0">
              <span class="igcsefy-profile-syllabus__section-count text-[11px] tabular-nums" data-section-count><span data-section-completed>${counts.completed}</span>/<span data-section-total>${counts.total}</span></span>
              <span class="igcsefy-profile-syllabus__section-percent text-[11px] font-semibold tabular-nums w-8 text-right" data-section-percent>${percentage}%</span>
            </div>
          </div>
          <div class="px-5 pb-3">
            <div class="igcsefy-profile-syllabus__section-bar flex w-full h-[3px] rounded-full overflow-hidden" style="background:${theme.sectionTrack};gap:1px;">
              <div data-section-bar-completed style="width:${widths.completed}%;background:${theme.sectionFill};transition:width 0.8s cubic-bezier(0.4,0,0.2,1)"></div>
              <div data-section-bar-progress style="width:${widths.progress}%;background:${theme.sectionProgress};transition:width 0.8s cubic-bezier(0.4,0,0.2,1) 0.1s"></div>
            </div>
          </div>
          <div class="igcsefy-profile-syllabus__section-body" data-section-body="${escapeHtml(sectionKey)}" style="border-top:1px solid ${theme.sectionBorder}" ${expanded ? "" : "hidden"}>
            ${renderTopicRows(subject, level, section, sectionKey, states)}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderSubjectCards(subjects, states, uiState) {
    const theme = getSyllabusTheme();
    return subjects.map((subject) => {
      const expanded = uiState.expandedSubjects.has(subject.code);
      const activeLevel = getActiveSubjectLevel(subject);
      const sections = getSubjectSections(subject, activeLevel);
      const topicItems = flattenTopics(subject, activeLevel);
      const counts = getCounts(topicItems, states);
      const percentage = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
      const levelLabel = subject.hasDistinctLevels ? (activeLevel === "extended" ? "Extended" : "Core") : "Full syllabus";

      return `
        <section class="igcsefy-profile-syllabus__card" data-subject-card="${escapeHtml(subject.code)}">
          <div class="igcsefy-profile-syllabus__card-head flex flex-col sm:flex-row items-start gap-5 p-6 cursor-pointer select-none" data-subject-toggle="${escapeHtml(subject.code)}" aria-expanded="${expanded ? "true" : "false"}" role="button" tabindex="0">
            <span class="igcsefy-profile-syllabus__card-main">
              <span class="igcsefy-profile-syllabus__card-meta">
                <span class="igcsefy-profile-syllabus__card-name">${escapeHtml(subject.name)}</span>
                <span class="igcsefy-profile-syllabus__card-code">${escapeHtml(subject.code)}</span>
                <span class="igcsefy-profile-syllabus__card-badge">${escapeHtml(levelLabel)}</span>
              </span>
              <span class="igcsefy-profile-syllabus__stats">
                <span><strong data-subject-count="completed">${counts.completed}</strong><em>Completed</em></span>
                <span><strong data-subject-count="in-progress">${counts.inProgress}</strong><em>In progress</em></span>
                <span><strong data-subject-count="remaining">${counts.remaining}</strong><em>Remaining</em></span>
                <span><strong data-subject-count="total">${counts.total}</strong><em>Total</em></span>
              </span>
              <span class="igcsefy-profile-syllabus__progress">
                <span class="igcsefy-profile-syllabus__progress-bar"><span data-subject-progress-fill style="width:${percentage}%;position:absolute;left:0;top:0;height:100%;background:${theme.progressFill};border-radius:9999px;transition:width 0.6s cubic-bezier(0.4,0,0.2,1)"></span></span>
                <span class="igcsefy-profile-syllabus__progress-value" data-subject-progress-value>${percentage}%</span>
              </span>
            </span>
            <span class="igcsefy-profile-syllabus__card-side">
              <span class="igcsefy-profile-syllabus__heatmap">${renderHeatmap(topicItems, states)}</span>
            <span class="igcsefy-profile-syllabus__chevron flex-shrink-0 mt-1 transition-transform duration-200" style="color:${theme.chevron};transform:${expanded ? "rotate(90deg)" : "none"}">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </span>
            </span>
          </div>
          <div class="igcsefy-profile-syllabus__card-body" data-subject-body="${escapeHtml(subject.code)}" ${expanded ? "" : "hidden"}>
            <div class="igcsefy-profile-syllabus__subject-meta">
              <span>${sections.length} sections · ${counts.total} topics</span>
              <span>Tap any topic to cycle state</span>
            </div>
            <div class="igcsefy-profile-syllabus__sections">
              ${renderSectionCards(subject, activeLevel, states, uiState)}
            </div>
          </div>
        </section>
      `;
    }).join("");
  }

  function updateHeatmapCell(cell, state) {
    if (!cell) return;
    cell.classList.toggle("is-completed", state === "completed");
    cell.classList.toggle("is-progress", state === "in_progress");
  }

  function updateTopicButtonState(button, state) {
    if (!button) return;
    button.dataset.topicState = state;
    button.classList.toggle("is-completed", state === "completed");
    button.classList.toggle("is-progress", state === "in_progress");

    const marker = button.querySelector(".igcsefy-profile-syllabus__topic-marker");
    if (marker) {
      marker.innerHTML = renderTopicMarker(state);
    }

    const stateEl = button.querySelector(".igcsefy-profile-syllabus__topic-state");
    if (stateEl) {
      stateEl.textContent = getTopicStateLabel(state);
    }

    if (button._igcsefyCompletionTimer) {
      window.clearTimeout(button._igcsefyCompletionTimer);
      button._igcsefyCompletionTimer = 0;
    }
    button.classList.remove("is-just-completed");
    if (state === "completed") {
      void button.offsetWidth;
      button.classList.add("is-just-completed");
      button._igcsefyCompletionTimer = window.setTimeout(() => {
        button.classList.remove("is-just-completed");
        button._igcsefyCompletionTimer = 0;
      }, 520);
    }
  }

  function updateSectionCardMetrics(sectionCard, subject, level, section, states) {
    if (!sectionCard || !subject || !section) return;
    const theme = getSyllabusTheme();
    const counts = getCounts(flattenSectionTopics(subject, level, section), states);
    const percentage = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
    const widths = getSectionBarWidths(counts);

    const completed = sectionCard.querySelector("[data-section-completed]");
    const total = sectionCard.querySelector("[data-section-total]");
    const percent = sectionCard.querySelector("[data-section-percent]");
    const fillCompleted = sectionCard.querySelector("[data-section-bar-completed]");
    const fillProgress = sectionCard.querySelector("[data-section-bar-progress]");

    if (completed) completed.textContent = counts.completed;
    if (total) total.textContent = counts.total;
    if (percent) percent.textContent = `${percentage}%`;
    if (percent) percent.style.color = theme.percent;
    if (fillCompleted) fillCompleted.style.width = `${widths.completed}%`;
    if (fillCompleted) fillCompleted.style.background = theme.sectionFill;
    if (fillProgress) fillProgress.style.width = `${widths.progress}%`;
    if (fillProgress) fillProgress.style.background = theme.sectionProgress;
  }

  function updateSubjectCardMetrics(subjectCard, subject, states) {
    if (!subjectCard || !subject) return;
    const theme = getSyllabusTheme();
    const activeLevel = getActiveSubjectLevel(subject);
    const counts = getCounts(flattenTopics(subject, activeLevel), states);
    const percentage = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;

    const completed = subjectCard.querySelector('[data-subject-count="completed"]');
    const inProgress = subjectCard.querySelector('[data-subject-count="in-progress"]');
    const remaining = subjectCard.querySelector('[data-subject-count="remaining"]');
    const total = subjectCard.querySelector('[data-subject-count="total"]');
    const fill = subjectCard.querySelector("[data-subject-progress-fill]");
    const value = subjectCard.querySelector("[data-subject-progress-value]");

    if (completed) completed.textContent = counts.completed;
    if (inProgress) inProgress.textContent = counts.inProgress;
    if (remaining) remaining.textContent = counts.remaining;
    if (total) total.textContent = counts.total;
    if (fill) fill.style.width = `${percentage}%`;
    if (fill) fill.style.background = theme.progressFill;
    if (value) value.textContent = `${percentage}%`;
    if (value) value.style.color = theme.subjectPercent;

    subjectCard.querySelectorAll("[data-heatmap-key]").forEach((cell) => {
      updateHeatmapCell(cell, states[cell.getAttribute("data-heatmap-key")] || "not_started");
    });
  }

  function getSectionFromKey(subject, level, sectionKey) {
    if (!subject || !sectionKey) return null;
    const prefix = `${subject.code}-${level}-`;
    if (!sectionKey.startsWith(prefix)) return null;
    const index = Number(sectionKey.slice(prefix.length));
    if (!Number.isInteger(index) || index < 0) return null;
    return getSubjectSections(subject, level)[index] || null;
  }

  const syllabusCache = new Map();

  async function fetchSyllabus(code) {
    const subject = SUBJECTS[code];
    if (!subject) return null;

    // Return from cache immediately — no network round-trip
    if (syllabusCache.has(code)) return syllabusCache.get(code);

    const response = await fetch(`/resources/${subject.slug}/syllabus.json`);
    if (!response.ok) {
      throw new Error(`Failed to load syllabus for ${code}`);
    }

    const data = await response.json();
    const levels = prepareSubjectLevels(data);

    const result = {
      code,
      slug: subject.slug,
      name: subject.name,
      levels,
      hasDistinctLevels: levels.hasDistinctLevels
    };

    syllabusCache.set(code, result);
    return result;
  }

  // Pre-fetch syllabus data for tracked subjects in the background,
  // so the Syllabus tab renders instantly when clicked.
  function prefetchTrackedSyllabi() {
    try {
      const snapshot = dataStore.getSnapshot();
      const tracked = Array.isArray(snapshot && snapshot.trackedSubjects) ? snapshot.trackedSubjects : [];
      tracked.forEach(function(s) {
        const code = s && s.code ? s.code : null;
        if (code && SUBJECTS[code] && !syllabusCache.has(code)) {
          fetchSyllabus(code).catch(function() {}); // fire and forget
        }
      });
    } catch (e) {}
  }

  function bindInteractions(host, mountRoot, subjects) {
    host.querySelectorAll("[data-subject-toggle]").forEach((button) => {
      button.addEventListener("mouseenter", () => {
        button.style.background = getSyllabusTheme().subjectHover;
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "transparent";
      });
      button.addEventListener("click", () => {
        const code = button.getAttribute("data-subject-toggle");
        const body = host.querySelector(`[data-subject-body="${escapeSelector(code)}"]`);
        if (!body) return;
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", expanded ? "false" : "true");
        const chevron = button.querySelector(".igcsefy-profile-syllabus__chevron");
        if (chevron) chevron.style.transform = expanded ? "none" : "rotate(90deg)";
        body.hidden = expanded;
      });
    });

    host.querySelectorAll("[data-section-toggle]").forEach((button) => {
      button.addEventListener("mouseenter", () => {
        button.style.background = getSyllabusTheme().sectionHover;
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "transparent";
      });
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-section-toggle");
        const body = host.querySelector(`[data-section-body="${escapeSelector(key)}"]`);
        if (!body) return;
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", expanded ? "false" : "true");
        const chevron = button.querySelector(".igcsefy-profile-syllabus__section-chevron");
        if (chevron) chevron.style.transform = expanded ? "none" : "rotate(90deg)";
        body.hidden = expanded;
      });
    });

    host.querySelectorAll("[data-topic-key]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-topic-key");
        const current = dataStore.getSyllabusState(key);
        const next = STATUS_CYCLE[current];
        dataStore.setSyllabusState(key, next);

        const states = dataStore.getSyllabusStates();
        updateTopicButtonState(button, next);
        updateHeatmapCell(
          host.querySelector(`[data-heatmap-key="${escapeSelector(key)}"]`),
          next
        );

        const subjectCode = button.getAttribute("data-subject-code");
        const level = button.getAttribute("data-subject-level") || "core";
        const sectionKey = button.getAttribute("data-section-key");
        const subject = subjects.find((item) => item.code === subjectCode);
        const section = getSectionFromKey(subject, level, sectionKey);

        if (section) {
          updateSectionCardMetrics(
            host.querySelector(`[data-section-card="${escapeSelector(sectionKey)}"]`),
            subject,
            level,
            section,
            states
          );
        }

        if (subject) {
          updateSubjectCardMetrics(
            host.querySelector(`[data-subject-card="${escapeSelector(subjectCode)}"]`),
            subject,
            states
          );
        }
      });
    });
  }

  function hideOriginalChildren(root, host) {
    Array.from(root.children).forEach((child) => {
      if (child === host) return;
      child.dataset.igcsefyHidden = "true";
      child.dataset.igcsefyPrevDisplay = child.style.display || "";
      child.style.display = "none";
    });
  }

  function restoreOriginalChildren(root) {
    Array.from(root.children).forEach((child) => {
      if (child.classList.contains("igcsefy-profile-syllabus-host")) return;
      if (child.dataset.igcsefyHidden === "true") {
        child.style.display = child.dataset.igcsefyPrevDisplay || "";
        delete child.dataset.igcsefyHidden;
        delete child.dataset.igcsefyPrevDisplay;
      }
    });
  }

  function teardownMounted(root) {
    if (!root) return;
    const host = getMountedHost(root);
    if (host) host.remove();
    restoreOriginalChildren(root);
    root.dataset.igcsefySyllabusMounted = "";
    root.dataset.igcsefyCodes = "";
  }

  function renderMounted(root, subjects, states, uiState) {
    const resolvedUiState = normaliseUiState(uiState);
    const totalTopics = subjects.reduce((sum, subject) => {
      return sum + flattenTopics(subject, getActiveSubjectLevel(subject)).length;
    }, 0);

    let host = getMountedHost(root);
    if (!host) {
      host = document.createElement("div");
      host.className = "igcsefy-profile-syllabus-host";
      root.appendChild(host);
    }

    root.dataset.igcsefySyllabusMounted = "true";
    root.dataset.igcsefyCodes = subjects.map((subject) => subject.code).join(",");
    delete document.body.dataset.profileSyllabusPending;

    host.innerHTML = `
      <div class="igcsefy-profile-syllabus">
        <div class="igcsefy-profile-syllabus__summary">
          <div>
            <p class="igcsefy-profile-syllabus__eyebrow">Syllabus</p>
            <h2 class="igcsefy-profile-syllabus__title">${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"}</h2>
          </div>
          <p class="igcsefy-profile-syllabus__total">${totalTopics} total topics</p>
        </div>
        <div class="igcsefy-profile-syllabus__list">
          ${renderSubjectCards(subjects, states, resolvedUiState)}
        </div>
      </div>
    `;

    hideOriginalChildren(root, host);
    bindInteractions(host, root, subjects);
  }

  async function tryMountProfileSyllabus() {
    mountScheduled = false;
    const root = getContentRoot();
    if (!root) return;

    if (!isSyllabusTabVisible()) {
      delete document.body.dataset.profileSyllabusPending;
      teardownMounted(root);
      markProfilePatchReady("syllabus");
      return;
    }

    const selectedCodes = extractSelectedCodes(root);
    const signature = selectedCodes.join(",");
    if (
      root.dataset.igcsefySyllabusMounted === "true" &&
      root.dataset.igcsefyCodes === signature &&
      getMountedHost(root)
    ) {
      delete document.body.dataset.profileSyllabusPending;
      if (remoteSyllabusDataSeen) {
        markProfilePatchReady("syllabus");
      }
      return;
    }

    if (!selectedCodes.length) {
      teardownMounted(root);
      if ((root.textContent || "").includes("No subjects selected.")) {
        root.dataset.igcsefySyllabusMounted = "true";
        root.dataset.igcsefyCodes = "";
        delete document.body.dataset.profileSyllabusPending;
        if (remoteSyllabusDataSeen) {
          markProfilePatchReady("syllabus");
        }
      }
      return;
    }

    if (signature === lastSignature && root.dataset.igcsefySyllabusMounted === "loading") {
      return;
    }

    lastSignature = signature;
    root.dataset.igcsefySyllabusMounted = "loading";

    try {
      const subjects = (await Promise.all(selectedCodes.map(fetchSyllabus))).filter(Boolean);
      dataStore.setTrackedSubjects(subjects.map((subject) => ({
        code: subject.code,
        slug: subject.slug,
        name: subject.name,
        hasDistinctLevels: subject.hasDistinctLevels,
        level: getActiveSubjectLevel(subject)
      })));
      renderMounted(
        root,
        subjects,
        dataStore.getSyllabusStates(),
        captureUiState(getMountedHost(root) || root)
      );
      if (remoteSyllabusDataSeen) {
        markProfilePatchReady("syllabus");
      }
    } catch (error) {
      console.error(error);
      delete document.body.dataset.profileSyllabusPending;
      root.dataset.igcsefySyllabusMounted = "";
    }
  }

  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(tryMountProfileSyllabus);
    });
  }

  function watchForSyllabusTransition() {
    const rootNode = document.getElementById("root");
    if (!rootNode) return;

    if (transitionObserver) {
      transitionObserver.disconnect();
      transitionObserver = null;
    }

    const observer = new MutationObserver(() => {
      scheduleMount();
    });

    observer.observe(rootNode, { childList: true, subtree: true });
    transitionObserver = observer;

    window.setTimeout(() => {
      if (transitionObserver === observer) {
        observer.disconnect();
        transitionObserver = null;
      }
    }, 1800);
  }

  function watchForSubjectManager() {
    const rootNode = document.getElementById("root");
    if (!rootNode) return;

    if (subjectManagerObserver) {
      subjectManagerObserver.disconnect();
      subjectManagerObserver = null;
    }

    const observer = new MutationObserver(() => {
      scheduleSubjectManagerEnhancement();
    });

    observer.observe(rootNode, { childList: true, subtree: true });
    subjectManagerObserver = observer;
  }

  function bindTriggers() {
    document.addEventListener("click", (event) => {
      const target = event.target && event.target.closest ? event.target.closest("button") : null;
      if (!target) return;
      const label = (target.textContent || "").trim();

      if (label === "Syllabus") {
        document.body.dataset.profileSyllabusPending = "true";
        const root = getContentRoot();
        if (root) {
          root.dataset.igcsefySyllabusMounted = "";
          root.dataset.igcsefyCodes = "";
        }
        watchForSyllabusTransition();
        // If data is cached, mount immediately without waiting for rAF delays
        const rootNow = getContentRoot();
        if (rootNow) {
          const codes = extractSelectedCodes(rootNow);
          const allCached = codes.length > 0 && codes.every(c => syllabusCache.has(c));
          if (allCached) {
            tryMountProfileSyllabus();
          } else {
            scheduleMount();
          }
        } else {
          scheduleMount();
        }
        window.setTimeout(scheduleMount, 120);
        window.setTimeout(scheduleMount, 320);
        window.setTimeout(scheduleMount, 700);
      } else if (label === "Subjects" || label === "Overview" || label === "Activity") {
        delete document.body.dataset.profileSyllabusPending;
        if (transitionObserver) {
          transitionObserver.disconnect();
          transitionObserver = null;
        }
        teardownMounted(getContentRoot());
      }

      window.setTimeout(scheduleSubjectManagerEnhancement, 30);
      window.setTimeout(scheduleSubjectManagerEnhancement, 180);
    });

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const placeholder = (target.getAttribute("placeholder") || "").trim();
      if (placeholder !== "Search subjects…" && placeholder !== "Search subjects...") return;
      window.setTimeout(scheduleSubjectManagerEnhancement, 30);
    });

    window.addEventListener("igcsefy:data-change", (event) => {
      const reason = event && event.detail ? event.detail.reason : "";
      if (reason === "remote-load" || reason === "remote-update" || reason === "auth-dashboard-nudge") {
        remoteSyllabusDataSeen = true;
        scheduleMount();
      }
      scheduleSubjectManagerEnhancement();
      // Re-prefetch in case tracked subjects changed (e.g. after Supabase load)
      prefetchTrackedSyllabi();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Pre-fetch syllabus data immediately so the Syllabus tab renders
    // from cache with no visible delay when the user clicks it.
    prefetchTrackedSyllabi();

    bindTriggers();
    watchForSyllabusTransition();
    watchForSubjectManager();
    scheduleMount();
    scheduleSubjectManagerEnhancement();
    window.setTimeout(scheduleMount, 180);
    window.setTimeout(scheduleMount, 420);
    window.setTimeout(scheduleSubjectManagerEnhancement, 220);
  });
})();
