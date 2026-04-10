(function () {
  'use strict';

  var SETTINGS_KEY = 'igcsefy-settings';
  var LEGACY_PROGRESS_KEY = 'igcsefy-progress';
  var ACCOUNT_STORAGE_KEY = 'igcsefy-account';
  var SEARCH_KEYS = [
    'igcsefy.home.search.recent.v1',
    'igcsefy.home.search.selections.v1',
    'igcsefy-recent-searches'
  ];
  var ACCOUNT_DEFAULTS = {
    name: 'Student',
    email: '',
    avatar: ''
  };
  var STUDY_PREFERENCES_DEFAULTS = {
    defaultSubjectDestination: 'syllabus',
    rememberLastSubjectTab: true,
    pdfOpeningMode: 'preview',
    autoOpenMarkScheme: false,
    markSchemeOpenBehavior: 'same-tab',
    afterDownloadBehavior: 'stay',
    markAsInProgress: false,
    paperTargets: []
  };
  var SETTINGS_DEFAULTS = {
    appearance: {
      theme: 'dark',
      reducedMotion: false
    },
    studyPreferences: STUDY_PREFERENCES_DEFAULTS
  };
  var PAPER_TARGET_SUBJECTS_FALLBACK = [
    { id: 'mathematics-0580', label: 'Mathematics' },
    { id: 'physics-0625', label: 'Physics' },
    { id: 'chemistry-0620', label: 'Chemistry' },
    { id: 'biology-0610', label: 'Biology' },
    { id: 'english-first-language-0500', label: 'English Language' },
    { id: 'english-as-a-second-language-0510', label: 'English as a Second Language' },
    { id: 'computer-science-0478', label: 'Computer Science' },
    { id: 'economics-0455', label: 'Economics' },
    { id: 'business-studies-0450', label: 'Business Studies' },
    { id: 'accounting-0452', label: 'Accounting' },
    { id: 'sociology-0495', label: 'Sociology' },
    { id: 'psychology-0266', label: 'Psychology' }
  ];
  var PAPER_TARGET_LIMITS_FALLBACK = {
    'mathematics-0580': { core: 84, extended: 84 },
    'physics-0625': { core: 167, extended: 168 },
    'chemistry-0620': { core: 147, extended: 149 },
    'biology-0610': { core: 150, extended: 151 },
    'english-first-language-0500': { core: 84, extended: 84 },
    'english-as-a-second-language-0510': { core: 0, extended: 0 },
    'computer-science-0478': { core: 83, extended: 83 },
    'economics-0455': { core: 83, extended: 83 },
    'business-studies-0450': { core: 82, extended: 82 },
    'accounting-0452': { core: 82, extended: 82 },
    'sociology-0495': { core: 0, extended: 0 },
    'psychology-0266': { core: 0, extended: 0 }
  };
  var PAPER_TARGET_LEVEL_PAPER_NUMBERS = {
    'mathematics-0580': { core: [1, 3], extended: [2, 4] },
    'biology-0610': { core: [1, 3, 5, 6], extended: [2, 4, 5, 6] },
    'chemistry-0620': { core: [1, 3, 5, 6], extended: [2, 4, 5, 6] },
    'physics-0625': { core: [1, 3, 5, 6], extended: [2, 4, 5, 6] }
  };
  var LEGACY_PAPER_TARGET_SUBJECT_IDS = {
    mathematics: 'mathematics-0580',
    physics: 'physics-0625',
    chemistry: 'chemistry-0620',
    biology: 'biology-0610',
    'english-language': 'english-first-language-0500',
    'computer-science': 'computer-science-0478',
    economics: 'economics-0455',
    'business-studies': 'business-studies-0450',
    accounting: 'accounting-0452'
  };
  var LEGACY_PAPER_TARGET_SUBJECT_LABELS = {
    mathematics: 'Mathematics',
    physics: 'Physics',
    chemistry: 'Chemistry',
    biology: 'Biology',
    'english-language': 'English Language',
    'english-first-language-0500': 'English Language',
    'english-as-a-second-language-0510': 'English as a Second Language',
    'english-literature': 'English Literature',
    'computer-science': 'Computer Science',
    'computer-science-0478': 'Computer Science',
    economics: 'Economics',
    'economics-0455': 'Economics',
    'business-studies': 'Business Studies',
    'business-studies-0450': 'Business Studies',
    accounting: 'Accounting',
    'accounting-0452': 'Accounting',
    history: 'History',
    geography: 'Geography',
    'art-design': 'Art & Design',
    ict: 'ICT',
    'additional-mathematics': 'Additional Mathematics',
    'mathematics-0580': 'Mathematics',
    'physics-0625': 'Physics',
    'chemistry-0620': 'Chemistry',
    'biology-0610': 'Biology',
    'sociology-0495': 'Sociology',
    'psychology-0266': 'Psychology'
  };
  var PAPER_TARGET_SUBJECTS = PAPER_TARGET_SUBJECTS_FALLBACK.slice();
  var PAPER_TARGET_LIMITS = PAPER_TARGET_LIMITS_FALLBACK;
  var paperTargetSubjectsRequest = null;
  var SUPPORT_EMAIL = 'ebrahim.tariq@icloud.com';
  var HELP_ACTIONS = {
    'Report a bug': {
      subject: 'IGCSEfy bug report',
      body: 'Page:\nIssue:\nSteps to reproduce:\nExpected result:\nActual result:\n'
    },
    'Request a subject': {
      subject: 'IGCSEfy subject request',
      body: 'Subject name:\nSubject code (if known):\nWhy this subject should be added:\n'
    },
    'Send feedback': {
      subject: 'IGCSEfy feedback',
      body: 'Feedback:\n'
    }
  };

  var authState = {
    user: null,
    isAuthenticated: false
  };
  var patchObserver = null;
  var patchQueued = false;
  var exportInFlight = false;
  var resetInFlight = false;
  var settingsSyncInFlight = false;
  var lastSettingsSyncSignature = '';
  var accountUiState = {
    editingName: false,
    nameDraft: ''
  };
  var paperTargetsUiState = {
    activeSection: '',
    selectedSubject: PAPER_TARGET_SUBJECTS[0].id,
    selectedLevel: 'extended'
  };
  var PATCH_OBSERVER_OPTIONS = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'class',
      'style',
      'disabled',
      'aria-disabled',
      'aria-checked',
      'aria-pressed',
      'aria-selected',
      'data-state'
    ]
  };

  function getInitials(name) {
    if (!name) return '?';
    return String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) { return part.charAt(0); })
      .join('')
      .toUpperCase() || '?';
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {}
  }

  function readJson(key) {
    var raw = readStorage(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {}
  }

  function isIsoDateString(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function getSettingsSignature(settings) {
    if (!settings || typeof settings !== 'object') return '';

    try {
      return JSON.stringify({
        appearance: settings.appearance || SETTINGS_DEFAULTS.appearance,
        studyPreferences: settings.studyPreferences || STUDY_PREFERENCES_DEFAULTS
      });
    } catch (error) {
      return '';
    }
  }

  function normalizeMarkSchemeOpenBehavior(value) {
    return value === 'side-by-side' ? 'side-by-side' : 'same-tab';
  }

  function sanitizeAccount(raw, fallback) {
    var base = fallback || ACCOUNT_DEFAULTS;
    var next = raw && typeof raw === 'object' ? raw : {};
    return {
      name: typeof next.name === 'string' && next.name.trim() ? next.name.trim() : base.name,
      email: typeof next.email === 'string' && next.email.trim() ? next.email.trim() : base.email,
      avatar: typeof next.avatar === 'string' ? next.avatar : base.avatar
    };
  }

  function createEmptySnapshot() {
    return {
      trackedSubjects: [],
      subjectPreferences: {},
      syllabusTopicStates: {},
      pastPaperStatuses: {},
      updatedAt: new Date().toISOString()
    };
  }

  function getSupabaseUser() {
    return window.igcsefySupabase && window.igcsefySupabase.currentUser
      ? window.igcsefySupabase.currentUser
      : null;
  }

  function getProviderMode(user) {
    if (!user) return 'local';
    var identities = Array.isArray(user.identities) ? user.identities : [];
    for (var i = 0; i < identities.length; i += 1) {
      var provider = String(identities[i] && identities[i].provider || '').toLowerCase();
      if (provider === 'google') return 'google';
    }
    var appProvider = String(user.app_metadata && user.app_metadata.provider || '').toLowerCase();
    if (appProvider === 'google') return 'google';
    return 'email';
  }

  function getProviderLabel(user) {
    var mode = getProviderMode(user);
    if (mode === 'google') return 'Google';
    if (mode === 'email') return 'Email & Password';
    return 'Local only';
  }

  function getSupabaseAvatar(user) {
    var meta = user && user.user_metadata ? user.user_metadata : {};
    if (typeof meta.avatar_url === 'string' && meta.avatar_url) return meta.avatar_url;
    if (typeof meta.avatar === 'string' && meta.avatar) return meta.avatar;
    return '';
  }

  function getAccountSeed() {
    var cached = window.igcsefyUser && typeof window.igcsefyUser.get === 'function'
      ? window.igcsefyUser.get()
      : null;
    var sbUser = getSupabaseUser();
    var name = '';
    var email = '';
    var avatar = '';

    if (cached) {
      name = cached.name || '';
      email = cached.email || '';
      avatar = cached.avatar || '';
    } else if (sbUser) {
      name = (sbUser.user_metadata && (sbUser.user_metadata.full_name || sbUser.user_metadata.name)) || sbUser.email || '';
      email = sbUser.email || '';
      avatar = getSupabaseAvatar(sbUser);
    }

    if (!name && authState.isAuthenticated) {
      name = 'Student';
    }

    return sanitizeAccount({
      name: name || ACCOUNT_DEFAULTS.name,
      email: email || (authState.isAuthenticated ? 'Email unavailable' : ACCOUNT_DEFAULTS.email),
      avatar: avatar || ''
    }, ACCOUNT_DEFAULTS);
  }

  function loadAccount() {
    return sanitizeAccount(readJson(ACCOUNT_STORAGE_KEY), getAccountSeed());
  }

  function saveAccount(account) {
    var next = sanitizeAccount(account, getAccountSeed());
    writeStorage(ACCOUNT_STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function updateAccount(patch) {
    var current = loadAccount();
    var seed = getAccountSeed();
    return saveAccount({
      name: Object.prototype.hasOwnProperty.call(patch, 'name') ? patch.name : current.name,
      email: Object.prototype.hasOwnProperty.call(patch, 'email')
        ? patch.email
        : (authState.isAuthenticated && seed.email ? seed.email : current.email),
      avatar: Object.prototype.hasOwnProperty.call(patch, 'avatar') ? patch.avatar : current.avatar
    });
  }

  function getSubjectLabel(subjectId) {
    var normalizedSubjectId = normalizePaperTargetSubjectId(subjectId);
    for (var index = 0; index < PAPER_TARGET_SUBJECTS.length; index += 1) {
      if (PAPER_TARGET_SUBJECTS[index].id === normalizedSubjectId) {
        return PAPER_TARGET_SUBJECTS[index].label;
      }
    }
    if (Object.prototype.hasOwnProperty.call(LEGACY_PAPER_TARGET_SUBJECT_LABELS, normalizedSubjectId)) {
      return LEGACY_PAPER_TARGET_SUBJECT_LABELS[normalizedSubjectId];
    }
    if (Object.prototype.hasOwnProperty.call(LEGACY_PAPER_TARGET_SUBJECT_LABELS, subjectId)) {
      return LEGACY_PAPER_TARGET_SUBJECT_LABELS[subjectId];
    }
    return normalizedSubjectId || subjectId;
  }

  function normalizePaperTargetSubjectId(subjectId) {
    var normalized = typeof subjectId === 'string' ? subjectId.trim() : '';
    if (!normalized) return '';
    if (Object.prototype.hasOwnProperty.call(LEGACY_PAPER_TARGET_SUBJECT_IDS, normalized)) {
      return LEGACY_PAPER_TARGET_SUBJECT_IDS[normalized];
    }
    return normalized;
  }

  function getPaperTargetSubjectRank(subjectId) {
    var normalizedSubjectId = normalizePaperTargetSubjectId(subjectId);
    for (var index = 0; index < PAPER_TARGET_SUBJECTS_FALLBACK.length; index += 1) {
      if (PAPER_TARGET_SUBJECTS_FALLBACK[index].id === normalizedSubjectId) {
        return index;
      }
    }
    return PAPER_TARGET_SUBJECTS_FALLBACK.length + 999;
  }

  function comparePaperTargetSubjects(left, right) {
    var leftRank = getPaperTargetSubjectRank(left.id);
    var rightRank = getPaperTargetSubjectRank(right.id);
    var leftLabel = String(left && left.label ? left.label : left && left.id ? left.id : '');
    var rightLabel = String(right && right.label ? right.label : right && right.id ? right.id : '');

    if (leftRank !== rightRank) return leftRank - rightRank;
    return leftLabel.localeCompare(rightLabel);
  }

  function getPaperTargetLevelKey(level) {
    return level === 'core' ? 'core' : 'extended';
  }

  function getPaperTargetLimit(subjectId, level) {
    var normalizedSubjectId = normalizePaperTargetSubjectId(subjectId);
    var limits = PAPER_TARGET_LIMITS[normalizedSubjectId]
      || PAPER_TARGET_LIMITS_FALLBACK[normalizedSubjectId]
      || { core: 0, extended: 0 };
    var levelKey = getPaperTargetLevelKey(level);

    return Math.max(0, Math.round(Number(limits[levelKey]) || 0));
  }

  function clampPaperTargetValue(subjectId, level, value) {
    var limit = getPaperTargetLimit(subjectId, level);
    var nextValue = Math.max(0, Math.round(Number(value) || 0));

    if (limit <= 0) return 0;
    return Math.min(limit, nextValue);
  }

  function getPaperTargetProgressPercent(value, subjectId, level) {
    var limit = getPaperTargetLimit(subjectId, level);

    if (limit <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((Math.min(value, limit) / limit) * 100)));
  }

  function getPaperTargetEntryLevels(subjectId, paperNumber) {
    var levelMapping = PAPER_TARGET_LEVEL_PAPER_NUMBERS[subjectId];
    var levels = [];

    if (!levelMapping) {
      return ['core', 'extended'];
    }

    if (levelMapping.core.indexOf(paperNumber) !== -1) {
      levels.push('core');
    }
    if (levelMapping.extended.indexOf(paperNumber) !== -1) {
      levels.push('extended');
    }

    return levels;
  }

  function extractPaperTargetSubjects(payload) {
    var rawSubjects = payload && Array.isArray(payload.subjects) ? payload.subjects : [];
    var seen = {};
    var next = rawSubjects.map(function (subject) {
      var id = normalizePaperTargetSubjectId(subject && subject.slug);
      var label = String(subject && subject.name ? subject.name : id).trim();

      if (!id || !label || seen[id]) {
        return null;
      }

      seen[id] = true;
      return { id: id, label: label };
    }).filter(Boolean);

    next.sort(comparePaperTargetSubjects);

    return next.length ? next : PAPER_TARGET_SUBJECTS_FALLBACK.slice();
  }

  function extractPaperTargetLimits(payload, subjects) {
    var rawEntries = payload && Array.isArray(payload.paperEntries) ? payload.paperEntries : [];
    var limits = {};
    var seenEntries = {};

    (Array.isArray(subjects) && subjects.length ? subjects : PAPER_TARGET_SUBJECTS_FALLBACK).forEach(function (subject) {
      limits[subject.id] = PAPER_TARGET_LIMITS_FALLBACK[subject.id]
        ? {
            core: PAPER_TARGET_LIMITS_FALLBACK[subject.id].core,
            extended: PAPER_TARGET_LIMITS_FALLBACK[subject.id].extended
          }
        : { core: 0, extended: 0 };
      limits[subject.id].core = 0;
      limits[subject.id].extended = 0;
    });

    rawEntries.forEach(function (entry) {
      var subjectId = normalizePaperTargetSubjectId(entry && entry.subjectSlug);
      var paperNumber = Math.round(Number(entry && entry.paperNumber));
      var entryKey = String(
        entry && entry.trackKey
          ? entry.trackKey
          : [
              subjectId,
              entry && entry.year || '',
              entry && entry.session || '',
              paperNumber || '',
              entry && entry.variant || ''
            ].join('|')
      );

      if (!subjectId || !Object.prototype.hasOwnProperty.call(limits, subjectId) || !paperNumber) {
        return;
      }
      if (!entry || !entry.qpHref) {
        return;
      }
      if (seenEntries[entryKey]) {
        return;
      }
      seenEntries[entryKey] = true;

      getPaperTargetEntryLevels(subjectId, paperNumber).forEach(function (level) {
        limits[subjectId][level] += 1;
      });
    });

    return limits;
  }

  function syncStoredPaperTargetsToAvailableCounts() {
    var parsed = readJson(SETTINGS_KEY);
    var studyPreferences;
    var rawTargets;
    var normalizedTargets;

    if (!parsed || !parsed.studyPreferences || typeof parsed.studyPreferences !== 'object') {
      return;
    }

    studyPreferences = parsed.studyPreferences;
    rawTargets = Array.isArray(studyPreferences.paperTargets) ? studyPreferences.paperTargets : [];
    normalizedTargets = sanitizePaperTargets(rawTargets);

    if (JSON.stringify(rawTargets) === JSON.stringify(normalizedTargets)) {
      return;
    }

    updateStudyPreferences({ paperTargets: normalizedTargets }, { schedule: false });
  }

  function setPaperTargetCatalog(subjects, limits) {
    PAPER_TARGET_SUBJECTS = Array.isArray(subjects) && subjects.length
      ? subjects.slice().sort(comparePaperTargetSubjects)
      : PAPER_TARGET_SUBJECTS_FALLBACK.slice();
    PAPER_TARGET_LIMITS = limits && typeof limits === 'object'
      ? limits
      : PAPER_TARGET_LIMITS_FALLBACK;

    if (paperTargetsUiState.selectedSubject) {
      paperTargetsUiState.selectedSubject = normalizePaperTargetSubjectId(paperTargetsUiState.selectedSubject);
    }

    syncStoredPaperTargetsToAvailableCounts();
    schedulePatch();
  }

  function loadPaperTargetSubjects() {
    if (paperTargetSubjectsRequest) {
      return paperTargetSubjectsRequest;
    }

    if (!window.fetch) {
      return Promise.resolve(PAPER_TARGET_SUBJECTS);
    }

    paperTargetSubjectsRequest = window.fetch('/assets/home-search-data.json')
      .then(function (response) {
        if (!response || !response.ok) {
          throw new Error('Subject catalog request failed with status ' + (response && response.status));
        }
        return response.json();
      })
      .then(function (payload) {
        var subjects = extractPaperTargetSubjects(payload);
        var limits = extractPaperTargetLimits(payload, subjects);
        setPaperTargetCatalog(subjects, limits);
        return subjects;
      })
      .catch(function (error) {
        console.error('IGCSEfy subject catalog load failed:', error);
        return PAPER_TARGET_SUBJECTS;
      });

    return paperTargetSubjectsRequest;
  }

  function sanitizePaperTarget(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var subjectId = normalizePaperTargetSubjectId(raw.subjectId);
    var level = raw.level === 'core' ? 'core' : raw.level === 'extended' ? 'extended' : '';
    var target;

    if (!subjectId || !level) {
      return null;
    }

    target = clampPaperTargetValue(subjectId, level, raw.target);
    if (target <= 0) return null;

    return {
      subjectId: subjectId,
      level: level,
      target: target
    };
  }

  function sanitizePaperTargets(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var next = [];

    list.forEach(function (entry) {
      var target = sanitizePaperTarget(entry);
      var key;

      if (!target) return;
      key = target.subjectId + ':' + target.level;
      next = next.filter(function (item) {
        return item.subjectId + ':' + item.level !== key;
      });
      next.push(target);
    });

    return next;
  }

  function loadSettings() {
    var parsed = readJson(SETTINGS_KEY);
    var appearance = parsed && parsed.appearance && typeof parsed.appearance === 'object'
      ? parsed.appearance
      : {};
    var studyPreferences = parsed && parsed.studyPreferences && typeof parsed.studyPreferences === 'object'
      ? parsed.studyPreferences
      : {};

    return {
      appearance: Object.assign({}, SETTINGS_DEFAULTS.appearance, appearance),
      studyPreferences: Object.assign({}, STUDY_PREFERENCES_DEFAULTS, studyPreferences, {
        markSchemeOpenBehavior: normalizeMarkSchemeOpenBehavior(studyPreferences.markSchemeOpenBehavior),
        paperTargets: sanitizePaperTargets(studyPreferences.paperTargets)
      }),
      updatedAt: isIsoDateString(parsed && parsed.updatedAt) ? parsed.updatedAt : ''
    };
  }

  function saveSettings(settings) {
    var next = settings && typeof settings === 'object' ? settings : {};
    var sanitized = {
      appearance: Object.assign({}, SETTINGS_DEFAULTS.appearance, next.appearance),
      studyPreferences: Object.assign({}, STUDY_PREFERENCES_DEFAULTS, next.studyPreferences, {
        markSchemeOpenBehavior: normalizeMarkSchemeOpenBehavior(next.studyPreferences && next.studyPreferences.markSchemeOpenBehavior),
        paperTargets: sanitizePaperTargets(next.studyPreferences && next.studyPreferences.paperTargets)
      }),
      updatedAt: new Date().toISOString()
    };
    writeStorage(SETTINGS_KEY, JSON.stringify(sanitized));
    return sanitized;
  }

  function updateStudyPreferences(patch, options) {
    var current = loadSettings();
    var next = saveSettings({
      appearance: current.appearance,
      studyPreferences: Object.assign({}, current.studyPreferences, patch || {})
    });

    if (!options || options.schedule !== false) {
      schedulePatch();
    }

    syncStoredSettingsIfNeeded();

    return next.studyPreferences;
  }

  function getPaperTargets() {
    return sanitizePaperTargets(loadSettings().studyPreferences.paperTargets);
  }

  function getCurrentPaperTarget(targets) {
    var list = Array.isArray(targets) ? targets : getPaperTargets();
    var index;

    for (index = 0; index < list.length; index += 1) {
      if (
        list[index].subjectId === paperTargetsUiState.selectedSubject
        && list[index].level === paperTargetsUiState.selectedLevel
      ) {
        return list[index];
      }
    }

    return null;
  }

  function formatPaperTargetValue(value) {
    var limit = getPaperTargetLimit(paperTargetsUiState.selectedSubject, paperTargetsUiState.selectedLevel);

    if (limit > 0 && value >= limit) return 'All';
    if (value <= 0) return 'Not set';
    return String(value);
  }

  function getPaperTargetHelperText(value) {
    var limit = getPaperTargetLimit(paperTargetsUiState.selectedSubject, paperTargetsUiState.selectedLevel);

    if (limit <= 0) {
      return 'No past papers are currently available for this subject & level.';
    }
    if (value >= limit) {
      return "You're aiming to complete all " + limit + " available papers.";
    }
    if (value <= 0) {
      return limit + " papers are available for this subject & level.";
    }
    return "You're aiming to complete " + value + " of " + limit + " available papers.";
  }

  function sortPaperTargets(targets) {
    var rank = {};
    var sorted = Array.isArray(targets) ? targets.slice() : [];

    PAPER_TARGET_SUBJECTS.forEach(function (subject, index) {
      rank[subject.id] = index;
    });

    sorted.sort(function (left, right) {
      var leftSubjectId = normalizePaperTargetSubjectId(left.subjectId);
      var rightSubjectId = normalizePaperTargetSubjectId(right.subjectId);
      var leftRank = Object.prototype.hasOwnProperty.call(rank, leftSubjectId) ? rank[leftSubjectId] : 999;
      var rightRank = Object.prototype.hasOwnProperty.call(rank, rightSubjectId) ? rank[rightSubjectId] : 999;
      var subjectDelta = leftRank - rightRank;
      if (subjectDelta !== 0) return subjectDelta;
      if (left.level === right.level) return 0;
      return left.level === 'core' ? -1 : 1;
    });

    return sorted;
  }

  function setPaperTarget(subjectId, level, value, options) {
    var current = getPaperTargets().filter(function (entry) {
      return !(entry.subjectId === subjectId && entry.level === level);
    });
    var nextValue = clampPaperTargetValue(subjectId, level, value);

    if (nextValue > 0) {
      current.push({
        subjectId: subjectId,
        level: level,
        target: nextValue
      });
    }

    return updateStudyPreferences({ paperTargets: current }, options);
  }

  function deletePaperTarget(subjectId, level) {
    return updateStudyPreferences({
      paperTargets: getPaperTargets().filter(function (entry) {
        return !(entry.subjectId === subjectId && entry.level === level);
      })
    });
  }

  function syncAccountStorageFromIdentity(user) {
    if (!user) return;
    saveAccount({
      name: user.name || ACCOUNT_DEFAULTS.name,
      email: user.email || ACCOUNT_DEFAULTS.email,
      avatar: user.avatar || ''
    });
  }

  function syncSharedIdentity(account, shouldDispatch) {
    if (!window.igcsefyUser || typeof window.igcsefyUser.set !== 'function') {
      return;
    }

    var current = typeof window.igcsefyUser.get === 'function' ? window.igcsefyUser.get() : null;
    window.igcsefyUser.set({
      name: account.name,
      email: authState.isAuthenticated
        ? ((current && current.email) || getAccountSeed().email || account.email)
        : account.email,
      avatar: account.avatar
    }, shouldDispatch);
  }

  function buildSupabaseAccountMetadata(account) {
    return {
      full_name: account.name,
      name: account.name,
      avatar_url: account.avatar || '',
      avatar: account.avatar || ''
    };
  }

  async function syncAccountToSupabase(account) {
    var supabaseApi = window.igcsefySupabase;
    var syncedUser;

    if (!authState.isAuthenticated || !supabaseApi || !supabaseApi.client || !supabaseApi.client.auth) {
      return account;
    }

    if (typeof supabaseApi.saveUserMetadataPatch === 'function') {
      syncedUser = await supabaseApi.saveUserMetadataPatch(buildSupabaseAccountMetadata(account));
    } else {
      var result = await supabaseApi.client.auth.updateUser({
        data: buildSupabaseAccountMetadata(account)
      });
      if (result && result.error) throw result.error;
      syncedUser = result && result.data ? result.data.user : null;
    }

    if (syncedUser) {
      if (window.igcsefyUser && typeof window.igcsefyUser.fromSupabaseUser === 'function') {
        var sharedUser = window.igcsefyUser.fromSupabaseUser(syncedUser, true);
        if (sharedUser) {
          syncAccountStorageFromIdentity(sharedUser);
        }
      } else {
        syncAccountStorageFromIdentity({
          name: account.name,
          email: syncedUser.email || account.email,
          avatar: getSupabaseAvatar(syncedUser) || account.avatar
        });
      }
    }

    return account;
  }

  function syncStoredSettingsIfNeeded() {
    var supabaseApi = window.igcsefySupabase;
    var currentSettings;
    var signature;

    if (!authState.isAuthenticated || !supabaseApi || typeof supabaseApi.saveUserSettings !== 'function') {
      return;
    }

    currentSettings = loadSettings();
    signature = getSettingsSignature(currentSettings);

    if (!signature || signature === lastSettingsSyncSignature || settingsSyncInFlight) {
      return;
    }

    settingsSyncInFlight = true;
    supabaseApi.saveUserSettings(currentSettings, { touchUpdatedAt: false }).then(function (savedSettings) {
      var nextSettings = savedSettings && typeof savedSettings === 'object' ? savedSettings : loadSettings();
      lastSettingsSyncSignature = getSettingsSignature(nextSettings);
    }).catch(function (error) {
      console.error('IGCSEFy settings sync failed:', error);
    }).finally(function () {
      var latestSignature = getSettingsSignature(loadSettings());
      settingsSyncInFlight = false;
      if (latestSignature && latestSignature !== lastSettingsSyncSignature) {
        syncStoredSettingsIfNeeded();
      }
    });
  }

  function persistAccountUpdate(patch) {
    var next = updateAccount(patch);
    syncSharedIdentity(next, true);
    schedulePatch();

    if (authState.isAuthenticated) {
      syncAccountToSupabase(next).catch(function (error) {
        console.error('IGCSEfy account sync failed:', error);
      });
    }

    return next;
  }

  function getDisplayUser() {
    var account = loadAccount();
    var seed = getAccountSeed();
    var sbUser = getSupabaseUser();
    var email = authState.isAuthenticated && seed.email ? seed.email : account.email;

    return {
      name: account.name,
      email: email || (authState.isAuthenticated ? 'Email unavailable' : 'Sign in on Profile to sync your progress'),
      avatar: account.avatar,
      initials: getInitials(account.name),
      provider: getProviderLabel(sbUser)
    };
  }

  function setDisabled(button, disabled, title) {
    if (!button) return;
    button.disabled = !!disabled;
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    button.classList.toggle('igcsefy-settings-action-disabled', !!disabled);
    if (title) {
      button.title = title;
    } else {
      button.removeAttribute('title');
    }
  }

  function patchHeaderCopy() {
    document.querySelectorAll('#root h1').forEach(function (heading) {
      if ((heading.textContent || '').trim() === 'Personalise your experience') {
        heading.textContent = 'Personalise your IGCSEfy experience';
      }
    });
  }

  function patchLegalLinks() {
    document.querySelectorAll('a[href="/privacy"]').forEach(function (link) {
      link.href = '/privacy/';
    });
    document.querySelectorAll('a[href="/terms"]').forEach(function (link) {
      link.href = '/terms/';
    });
  }

  function pausePatchObserver(callback) {
    if (!patchObserver) {
      callback();
      return;
    }

    var root = document.getElementById('root');
    patchObserver.disconnect();
    try {
      callback();
    } finally {
      if (root) {
        patchObserver.observe(root, PATCH_OBSERVER_OPTIONS);
      }
    }
  }

  function createElement(tagName, className, textContent) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (typeof textContent === 'string') node.textContent = textContent;
    return node;
  }

  function createSvgIcon(name, className) {
    var namespace = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);

    var paths = [];
    if (name === 'camera') {
      paths = [
        ['path', { d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z' }],
        ['circle', { cx: '12', cy: '13', r: '3' }]
      ];
    } else if (name === 'pencil') {
      paths = [
        ['path', { d: 'M12 20h9' }],
        ['path', { d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z' }]
      ];
    } else if (name === 'check') {
      paths = [
        ['path', { d: 'M20 6 9 17l-5-5' }]
      ];
    } else if (name === 'x') {
      paths = [
        ['path', { d: 'M18 6 6 18' }],
        ['path', { d: 'm6 6 12 12' }]
      ];
    } else if (name === 'target') {
      paths = [
        ['circle', { cx: '12', cy: '12', r: '8' }],
        ['circle', { cx: '12', cy: '12', r: '4' }],
        ['circle', { cx: '12', cy: '12', r: '1.25' }]
      ];
    } else if (name === 'trash') {
      paths = [
        ['path', { d: 'M3 6h18' }],
        ['path', { d: 'M8 6V4h8v2' }],
        ['path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }],
        ['path', { d: 'M10 11v6' }],
        ['path', { d: 'M14 11v6' }]
      ];
    } else if (name === 'chevron-down') {
      paths = [
        ['path', { d: 'M6 9l6 6 6-6' }]
      ];
    } else if (name === 'arrow-left') {
      paths = [
        ['path', { d: 'M19 12H5' }],
        ['path', { d: 'm12 19-7-7 7-7' }]
      ];
    }

    paths.forEach(function (entry) {
      var shape = document.createElementNS(namespace, entry[0]);
      var attrs = entry[1];
      Object.keys(attrs).forEach(function (key) {
        shape.setAttribute(key, attrs[key]);
      });
      svg.appendChild(shape);
    });

    return svg;
  }

  function createIconButton(label, iconName) {
    var button = createElement('button', 'igcsefy-account-icon-button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.appendChild(createSvgIcon(iconName, 'igcsefy-account-icon'));
    return button;
  }

  function syncNameDraft(display) {
    if (!accountUiState.editingName) {
      accountUiState.nameDraft = display.name;
      return;
    }

    if (!accountUiState.nameDraft) {
      accountUiState.nameDraft = display.name;
    }
  }

  function saveNameDraft() {
    var nextName = String(accountUiState.nameDraft || '').trim();
    if (!nextName) {
      accountUiState.editingName = false;
      accountUiState.nameDraft = loadAccount().name;
      schedulePatch();
      return;
    }

    persistAccountUpdate({ name: nextName });
    accountUiState.editingName = false;
    accountUiState.nameDraft = nextName;
    schedulePatch();
  }

  function cancelNameEdit() {
    accountUiState.editingName = false;
    accountUiState.nameDraft = loadAccount().name;
    schedulePatch();
  }

  function optimizeAvatarDataUrl(dataUrl) {
    return new Promise(function (resolve) {
      if (!dataUrl || !window.Image || !document.createElement) {
        resolve(dataUrl);
        return;
      }

      var image = new Image();
      image.onload = function () {
        var maxSize = 160;
        var width = image.naturalWidth || image.width || maxSize;
        var height = image.naturalHeight || image.height || maxSize;
        var scale = Math.min(1, maxSize / Math.max(width, height));
        var canvas = document.createElement('canvas');
        var context = canvas.getContext && canvas.getContext('2d');

        if (!context) {
          resolve(dataUrl);
          return;
        }

        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        try {
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch (error) {
          resolve(dataUrl);
        }
      };
      image.onerror = function () {
        resolve(dataUrl);
      };
      image.src = dataUrl;
    });
  }

  function handleAvatarSelection(file) {
    if (!file || !window.FileReader || (file.type && file.type.indexOf('image/') !== 0)) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      var result = typeof reader.result === 'string' ? reader.result : '';
      optimizeAvatarDataUrl(result).then(function (avatarDataUrl) {
        persistAccountUpdate({ avatar: avatarDataUrl });
        schedulePatch();
      });
    };
    reader.onerror = function (error) {
      console.error('IGCSEfy avatar upload failed:', error);
    };
    reader.readAsDataURL(file);
  }

  function buildAccountActions(sbUser) {
    var actions = createElement('div', 'igcsefy-account-actions');
    var changePassword = createElement('button', 'igcsefy-account-action', 'Change password');
    changePassword.type = 'button';

    if (!authState.isAuthenticated) {
      changePassword.title = 'Sign in on the Profile page to change your password.';
    } else if (getProviderMode(sbUser) === 'google') {
      changePassword.title = 'Google-managed accounts do not change passwords inside IGCSEfy.';
    }

    var signButton = createElement(
      'button',
      'igcsefy-account-action igcsefy-account-action-destructive',
      authState.isAuthenticated ? 'Sign out' : 'Sign in'
    );
    signButton.type = 'button';
    if (!authState.isAuthenticated) {
      signButton.classList.remove('igcsefy-account-action-destructive');
    }

    actions.appendChild(changePassword);
    actions.appendChild(signButton);
    return actions;
  }

  function renderAccountSection(section, display, sbUser) {
    var content = Array.from(section.children).find(function (child) {
      return String(child.className || '').indexOf('space-y-5') !== -1;
    });
    if (!content) return;

    syncNameDraft(display);

    pausePatchObserver(function () {
      content.textContent = '';

      var topRow = createElement('div', 'igcsefy-account-row');
      var avatarGroup = createElement('div', 'igcsefy-account-avatar-group');
      var avatarFrame = createElement('div', 'igcsefy-account-avatar');
      var fileInput = createElement('input', 'igcsefy-account-file-input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.tabIndex = -1;
      fileInput.setAttribute('aria-hidden', 'true');

      if (display.avatar) {
        var avatarImage = createElement('img', 'igcsefy-account-avatar-image');
        avatarImage.src = display.avatar;
        avatarImage.alt = display.name + ' avatar';
        avatarFrame.appendChild(avatarImage);
      } else {
        avatarFrame.appendChild(createElement('span', 'igcsefy-account-initials', display.initials));
      }

      var avatarOverlay = createElement('button', 'igcsefy-account-avatar-overlay');
      avatarOverlay.type = 'button';
      avatarOverlay.setAttribute('aria-label', 'Upload avatar');
      avatarOverlay.appendChild(createSvgIcon('camera', 'igcsefy-account-camera-icon'));
      avatarOverlay.addEventListener('click', function () {
        fileInput.click();
      });
      fileInput.addEventListener('change', function () {
        handleAvatarSelection(fileInput.files && fileInput.files[0] ? fileInput.files[0] : null);
      });

      avatarGroup.appendChild(avatarFrame);
      avatarGroup.appendChild(avatarOverlay);
      avatarGroup.appendChild(fileInput);

      var details = createElement('div', 'igcsefy-account-details');
      var email = createElement('p', 'igcsefy-account-email', display.email);

      if (accountUiState.editingName) {
        var editRow = createElement('div', 'igcsefy-account-name-edit');
        var nameInput = createElement('input', 'igcsefy-account-name-input');
        nameInput.type = 'text';
        nameInput.value = accountUiState.nameDraft;
        nameInput.autocomplete = 'name';
        nameInput.setAttribute('aria-label', 'Profile name');
        nameInput.addEventListener('input', function () {
          accountUiState.nameDraft = nameInput.value;
        });
        nameInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            saveNameDraft();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelNameEdit();
          }
        });

        var saveButton = createIconButton('Save name', 'check');
        saveButton.addEventListener('click', saveNameDraft);

        var cancelButton = createIconButton('Cancel name edit', 'x');
        cancelButton.addEventListener('click', cancelNameEdit);

        editRow.appendChild(nameInput);
        editRow.appendChild(saveButton);
        editRow.appendChild(cancelButton);
        details.appendChild(editRow);
        details.appendChild(email);

        window.requestAnimationFrame(function () {
          nameInput.focus({ preventScroll: true });
          nameInput.select();
        });
      } else {
        var nameRow = createElement('div', 'igcsefy-account-name-row');
        var name = createElement('p', 'igcsefy-account-name', display.name);
        var editButton = createIconButton('Edit name', 'pencil');
        editButton.addEventListener('click', function () {
          accountUiState.editingName = true;
          accountUiState.nameDraft = display.name;
          schedulePatch();
        });
        nameRow.appendChild(name);
        nameRow.appendChild(editButton);
        details.appendChild(nameRow);
        details.appendChild(email);
      }

      var provider = createElement('span', 'igcsefy-account-provider', display.provider);
      topRow.appendChild(avatarGroup);
      topRow.appendChild(details);
      topRow.appendChild(provider);

      content.appendChild(topRow);
      content.appendChild(createElement('div', 'igcsefy-account-divider'));
      content.appendChild(buildAccountActions(sbUser));
    });
  }

  function patchAccountSection() {
    var section = document.getElementById('account');
    if (!section) return;

    var display = getDisplayUser();
    var sbUser = getSupabaseUser();
    renderAccountSection(section, display, sbUser);
  }

  function patchSyncStatus() {
    var section = document.getElementById('data-privacy');
    if (!section) return;

    var wrapper = Array.from(section.querySelectorAll('span')).find(function (node) {
      var text = (node.textContent || '').trim();
      return /^(Local only|Synced|Last saved just now)$/.test(text) && !!node.querySelector('span');
    });
    if (!wrapper) return;

    var dot = wrapper.querySelector('span');
    var label = authState.isAuthenticated ? 'Synced' : 'Local only';

    Array.from(wrapper.childNodes).forEach(function (child) {
      if (child !== dot) {
        wrapper.removeChild(child);
      }
    });
    wrapper.appendChild(document.createTextNode(label));

    if (dot) {
      var root = document.documentElement;
      var isLightTheme = root.classList.contains('light') || root.dataset.theme === 'light';
      dot.style.backgroundColor = authState.isAuthenticated
        ? (isLightTheme ? '#000000' : '#ECEADD')
        : '#666666';
    }
  }

  function patchStudyPreferencesSection() {
    var section = document.getElementById('study-preferences');
    var settings;
    var pdfOpeningRow;
    var autoOpenRow;
    var behaviorRow;
    var pdfOpeningControl;
    var autoOpenControl;
    var autoOpenCopy;
    var behaviorCopy;
    var behaviorControl;
    var autoOpenLabel;
    var autoOpenDescription;
    var behaviorLabel;
    var behaviorDescription;
    var heading;
    var storedSettings;
    var markSchemeAvailable;
    var behaviorDisabled;
    var effectivePdfOpeningMode;
    var effectiveAutoOpenMarkScheme;
    var autoOpenThumb;

    function findSettingRow(label) {
      return Array.from(section.querySelectorAll('.py-1')).find(function (row) {
        var copy = row.firstElementChild;
        var title = copy && copy.querySelector ? copy.querySelector('p') : null;
        return title && (title.textContent || '').trim() === label;
      }) || null;
    }

    function isSwitchChecked(control, fallback) {
      var ariaChecked;
      var dataState;

      if (!control || !control.getAttribute) return !!fallback;

      ariaChecked = control.getAttribute('aria-checked');
      dataState = control.getAttribute('data-state');

      if (ariaChecked === 'true' || dataState === 'checked' || control.checked === true) return true;
      if (ariaChecked === 'false' || dataState === 'unchecked' || control.checked === false) return false;
      return !!fallback;
    }

    function isSegmentActive(button) {
      if (!button) return false;
      if (button.getAttribute && button.getAttribute('aria-pressed') === 'true') return true;
      if (button.getAttribute && button.getAttribute('aria-checked') === 'true') return true;
      if (button.dataset && (button.dataset.state === 'active' || button.dataset.state === 'checked')) return true;
      return button.classList.contains('bg-card');
    }

    function getSegmentedValue(control, fallback) {
      var active = null;
      var label;

      if (!control || !control.querySelectorAll) return fallback;
      active = Array.from(control.querySelectorAll('button')).find(isSegmentActive) || null;
      if (!active) return fallback;

      label = String(active.textContent || '').trim().toLowerCase();
      if (label === 'preview first') return 'preview';
      if (label === 'direct download') return 'direct-download';
      if (label === 'side by side') return 'side-by-side';
      if (label === 'same tab') return 'same-tab';

      return fallback;
    }

    function getBehaviorDescription(value) {
      if (value === 'side-by-side') {
        return 'The mark scheme opens alongside the question paper in a split view.';
      }
      return 'The mark scheme replaces the question paper in the same preview.';
    }

    if (!section) return;

    storedSettings = readJson(SETTINGS_KEY);
    settings = loadSettings().studyPreferences;
    effectivePdfOpeningMode = settings.pdfOpeningMode;
    effectiveAutoOpenMarkScheme = settings.autoOpenMarkScheme;
    if (
      storedSettings
      && storedSettings.studyPreferences
      && storedSettings.studyPreferences.markSchemeOpenBehavior === 'new-tab'
    ) {
      updateStudyPreferences({ markSchemeOpenBehavior: 'same-tab' }, { schedule: false });
      settings = loadSettings().studyPreferences;
    }
    effectivePdfOpeningMode = settings.pdfOpeningMode;
    effectiveAutoOpenMarkScheme = settings.autoOpenMarkScheme;
    pdfOpeningRow = findSettingRow('PDF opening mode');
    autoOpenRow = findSettingRow('Auto-open mark scheme');
    behaviorRow = findSettingRow('Mark scheme opening behavior') || findSettingRow('Opening behaviour');
    if (!pdfOpeningRow || !autoOpenRow || !behaviorRow) return;

    pausePatchObserver(function () {
      pdfOpeningControl = pdfOpeningRow.lastElementChild;
      autoOpenControl = autoOpenRow.lastElementChild;
      autoOpenCopy = autoOpenRow.firstElementChild;
      behaviorCopy = behaviorRow.firstElementChild;
      behaviorControl = behaviorRow.lastElementChild;
      autoOpenLabel = autoOpenCopy && autoOpenCopy.querySelector ? autoOpenCopy.querySelector('p') : null;
      autoOpenDescription = autoOpenCopy && autoOpenCopy.querySelectorAll
        ? autoOpenCopy.querySelectorAll('p')[1]
        : null;
      behaviorLabel = behaviorCopy && behaviorCopy.querySelector ? behaviorCopy.querySelector('p') : null;
      behaviorDescription = behaviorCopy && behaviorCopy.querySelectorAll
        ? behaviorCopy.querySelectorAll('p')[1]
        : null;
      heading = section.querySelector('[data-igcsefy-mark-scheme-heading]');

      effectivePdfOpeningMode = getSegmentedValue(pdfOpeningControl, settings.pdfOpeningMode);
      effectiveAutoOpenMarkScheme = isSwitchChecked(autoOpenControl, settings.autoOpenMarkScheme);

      if (effectivePdfOpeningMode === 'direct-download' && settings.autoOpenMarkScheme) {
        updateStudyPreferences({ autoOpenMarkScheme: false }, { schedule: false });
        settings = loadSettings().studyPreferences;
        effectiveAutoOpenMarkScheme = false;
      }

      markSchemeAvailable = effectivePdfOpeningMode === 'preview';
      behaviorDisabled = !markSchemeAvailable || !effectiveAutoOpenMarkScheme;

      if (!heading) {
        heading = createElement('div', 'igcsefy-mark-scheme-heading');
        heading.setAttribute('data-igcsefy-mark-scheme-heading', 'true');
        heading.appendChild(createElement('p', 'igcsefy-mark-scheme-heading-title', 'Mark Scheme'));
        autoOpenRow.parentNode.insertBefore(heading, autoOpenRow);
      }

      section.classList.add('igcsefy-study-preferences');
      autoOpenRow.classList.add('igcsefy-mark-scheme-row', 'igcsefy-mark-scheme-row--toggle');
      autoOpenRow.classList.toggle('igcsefy-mark-scheme-row--disabled', !markSchemeAvailable);
      behaviorRow.classList.add('igcsefy-mark-scheme-row', 'igcsefy-mark-scheme-row--behavior');
      behaviorRow.classList.toggle('igcsefy-mark-scheme-row--disabled', behaviorDisabled);

      if (autoOpenLabel) {
        autoOpenLabel.textContent = 'Auto-open mark scheme';
      }
      if (autoOpenDescription) {
        autoOpenDescription.textContent = markSchemeAvailable
          ? 'Automatically open the corresponding mark scheme when you view a question paper.'
          : 'Available only when PDF opening mode is set to Preview first.';
      }
      if (behaviorLabel) {
        behaviorLabel.textContent = 'Opening behaviour';
      }
      if (behaviorDescription) {
        if (!markSchemeAvailable) {
          behaviorDescription.textContent = 'Split and same-tab mark scheme views are only available with Preview first.';
        } else if (!effectiveAutoOpenMarkScheme) {
          behaviorDescription.textContent = 'Turn on Auto-open mark scheme to choose how it opens.';
        } else {
          behaviorDescription.textContent = getBehaviorDescription(settings.markSchemeOpenBehavior);
        }
      }
      if (autoOpenControl && autoOpenControl.getAttribute && autoOpenControl.getAttribute('role') === 'switch') {
        autoOpenThumb = autoOpenControl.querySelector ? autoOpenControl.querySelector('span') : null;

        autoOpenControl.setAttribute('aria-checked', effectiveAutoOpenMarkScheme ? 'true' : 'false');
        autoOpenControl.setAttribute('data-state', effectiveAutoOpenMarkScheme ? 'checked' : 'unchecked');
        autoOpenControl.disabled = !markSchemeAvailable;

        if (autoOpenThumb && autoOpenThumb.classList) {
          autoOpenThumb.classList.toggle('translate-x-[22px]', effectiveAutoOpenMarkScheme);
          autoOpenThumb.classList.toggle('bg-foreground', effectiveAutoOpenMarkScheme);
          autoOpenThumb.classList.toggle('translate-x-[3px]', !effectiveAutoOpenMarkScheme);
          autoOpenThumb.classList.toggle('bg-muted-foreground', !effectiveAutoOpenMarkScheme);
        }

        if (!markSchemeAvailable) {
          autoOpenControl.setAttribute('aria-disabled', 'true');
          autoOpenControl.title = 'Switch PDF opening mode to Preview first to use mark scheme auto-open.';
          autoOpenControl.style.pointerEvents = 'none';
          autoOpenControl.setAttribute('tabindex', '-1');
        } else {
          autoOpenControl.removeAttribute('aria-disabled');
          autoOpenControl.removeAttribute('title');
          autoOpenControl.style.removeProperty('pointer-events');
          autoOpenControl.removeAttribute('tabindex');
        }
      }
      if (behaviorControl) {
        behaviorControl.classList.add('igcsefy-mark-scheme-control');
        Array.from(behaviorControl.querySelectorAll('div')).forEach(function (group) {
          if (group.querySelector('button')) {
            group.classList.add('igcsefy-mark-scheme-segmented');
          }
        });
        Array.from(behaviorControl.querySelectorAll('button')).forEach(function (button) {
          var buttonText = (button.textContent || '').trim().toLowerCase();
          var value = buttonText === 'side by side' ? 'side-by-side' : 'same-tab';

          if (buttonText === 'new tab') {
            button.remove();
            return;
          }

          button.classList.add('igcsefy-mark-scheme-pill');
          button.classList.toggle(
            'igcsefy-mark-scheme-pill--active',
            !behaviorDisabled && value === settings.markSchemeOpenBehavior
          );
          button.disabled = behaviorDisabled;
          if (behaviorDisabled) {
            button.setAttribute('aria-disabled', 'true');
            button.style.pointerEvents = 'none';
            button.setAttribute('tabindex', '-1');
            if (!markSchemeAvailable) {
              button.title = 'Switch PDF opening mode to Preview first to choose a mark scheme layout.';
            } else {
              button.title = 'Turn on Auto-open mark scheme to choose a mark scheme layout.';
            }
          } else {
            button.removeAttribute('aria-disabled');
            button.removeAttribute('title');
            button.style.removeProperty('pointer-events');
            button.removeAttribute('tabindex');
          }
        });
      }
    });
  }

  function getSettingsNavButtonClass(isActive) {
    return [
      'flex items-center gap-3 text-left px-3 py-2.5 rounded-lg text-sm transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      isActive
        ? 'text-foreground bg-secondary/60 font-medium'
        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
    ].join(' ');
  }

  function createSettingsNavButton(label, sectionId, iconName) {
    var button = createElement('button');

    button.type = 'button';
    button.dataset.igcsefySettingsNav = sectionId;
    button.className = getSettingsNavButtonClass(false);
    button.appendChild(createSvgIcon(iconName, 'igcsefy-paper-targets-nav-icon'));
    button.appendChild(document.createTextNode(label));
    return button;
  }

  function patchPaperTargetsNav() {
    document.querySelectorAll('#root nav.flex.flex-col.gap-1').forEach(function (nav) {
      var button = nav.querySelector('[data-igcsefy-settings-nav="paper-targets"]');
      var studyPreferencesButton = Array.from(nav.querySelectorAll('button')).find(function (node) {
        return (node.textContent || '').trim() === 'Study Preferences';
      });
      var dataPrivacyButton = Array.from(nav.querySelectorAll('button')).find(function (node) {
        return (node.textContent || '').trim() === 'Data & Privacy';
      });

      pausePatchObserver(function () {
        if (!button) {
          button = createSettingsNavButton('Paper Targets', 'paper-targets', 'target');
          if (dataPrivacyButton && dataPrivacyButton.parentNode === nav) {
            nav.insertBefore(button, dataPrivacyButton);
          } else if (studyPreferencesButton && studyPreferencesButton.parentNode === nav) {
            nav.insertBefore(button, studyPreferencesButton.nextSibling);
          } else {
            nav.appendChild(button);
          }
        }

        Array.from(nav.querySelectorAll('button')).forEach(function (node) {
          var isCustom = node.dataset.igcsefySettingsNav === 'paper-targets';
          if (paperTargetsUiState.activeSection === 'paper-targets') {
            node.className = isCustom
              ? getSettingsNavButtonClass(true)
              : getSettingsNavButtonClass(false);
          } else if (isCustom) {
            node.className = getSettingsNavButtonClass(false);
          }
        });
      });
    });
  }

  function createSettingsCard(id, title, description) {
    var section = createElement('section', 'rounded-xl border border-border bg-card p-6 transition-colors duration-150');
    var header = createElement('div', 'mb-5');
    var heading = createElement('h2', 'text-base font-semibold text-foreground', title);
    var copy = createElement('p', 'mt-1 text-xs text-muted-foreground', description);
    var content = createElement('div', 'space-y-5');

    section.id = id;
    section.dataset.igcsefyCustomSection = id;
    header.appendChild(heading);
    header.appendChild(copy);
    section.appendChild(header);
    section.appendChild(content);

    return {
      section: section,
      content: content
    };
  }

  function createSettingsRow(label, description, vertical) {
    var row = createElement(
      'div',
      vertical
        ? 'igcsefy-paper-targets-setting igcsefy-paper-targets-setting-vertical'
        : 'igcsefy-paper-targets-setting'
    );
    var info = createElement('div', 'igcsefy-paper-targets-setting-copy');
    var title = createElement('p', 'igcsefy-paper-targets-label', label);
    var copy = createElement('p', 'igcsefy-paper-targets-description', description);
    var control = createElement(
      'div',
      vertical
        ? 'igcsefy-paper-targets-control igcsefy-paper-targets-control-full'
        : 'igcsefy-paper-targets-control'
    );

    info.appendChild(title);
    info.appendChild(copy);
    row.appendChild(info);
    row.appendChild(control);

    return {
      row: row,
      control: control
    };
  }

  function createPaperTargetsDivider() {
    return createElement('div', 'igcsefy-paper-targets-divider');
  }

  function syncPaperTargetsSelection() {
    paperTargetsUiState.selectedSubject = normalizePaperTargetSubjectId(paperTargetsUiState.selectedSubject);
    var hasSubject = PAPER_TARGET_SUBJECTS.some(function (subject) {
      return subject.id === paperTargetsUiState.selectedSubject;
    });

    if (!hasSubject) {
      paperTargetsUiState.selectedSubject = PAPER_TARGET_SUBJECTS[0].id;
    }
    if (paperTargetsUiState.selectedLevel !== 'core' && paperTargetsUiState.selectedLevel !== 'extended') {
      paperTargetsUiState.selectedLevel = 'extended';
    }
  }

  function createLevelButton(value, label, isActive) {
    var button = createElement(
      'button',
      isActive
        ? 'igcsefy-paper-targets-segment is-active'
        : 'igcsefy-paper-targets-segment',
      label
    );

    button.type = 'button';
    button.dataset.levelValue = value;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.addEventListener('click', function () {
      paperTargetsUiState.selectedLevel = value;
      schedulePatch();
    });

    return button;
  }

  function createPaperTargetsSection() {
    var card = createSettingsCard(
      'paper-targets',
      'Past Paper Targets',
      'Set subject-by-subject goals for how many past papers you want to complete.'
    );
    var targets = sortPaperTargets(getPaperTargets());
    var availableCount;
    var currentTarget;
    var currentValue;
    var displayValue;
    var activeTargets;
    var subjectRow;
    var subjectShell;
    var subjectSelect;
    var subjectChevron;
    var levelRow;
    var segmented;
    var targetRow;
    var targetShell;
    var targetHeader;
    var badge;
    var badgeValue;
    var rangeEnd;
    var slider;
    var helperText;

    syncPaperTargetsSelection();

    availableCount = getPaperTargetLimit(paperTargetsUiState.selectedSubject, paperTargetsUiState.selectedLevel);
    currentTarget = getCurrentPaperTarget(targets);
    currentValue = currentTarget
      ? clampPaperTargetValue(paperTargetsUiState.selectedSubject, paperTargetsUiState.selectedLevel, currentTarget.target)
      : 0;
    displayValue = formatPaperTargetValue(currentValue);
    activeTargets = targets.filter(function (entry) {
      return entry.target > 0;
    });

    subjectRow = createSettingsRow('Subject', 'Choose the subject to set a target for.', true);
    subjectShell = createElement('div', 'igcsefy-paper-targets-select-shell');
    subjectSelect = createElement('select', 'igcsefy-paper-targets-select');
    subjectSelect.setAttribute('aria-label', 'Subject');

    PAPER_TARGET_SUBJECTS.forEach(function (subject) {
      var option = createElement('option', null, subject.label);
      option.value = subject.id;
      option.selected = subject.id === paperTargetsUiState.selectedSubject;
      option.className = 'bg-card text-foreground';
      subjectSelect.appendChild(option);
    });

    subjectSelect.addEventListener('change', function () {
      paperTargetsUiState.selectedSubject = subjectSelect.value;
      schedulePatch();
    });

    subjectChevron = createSvgIcon('chevron-down', 'igcsefy-paper-targets-select-chevron');
    subjectShell.appendChild(subjectSelect);
    subjectShell.appendChild(subjectChevron);
    subjectRow.control.appendChild(subjectShell);
    card.content.appendChild(subjectRow.row);
    card.content.appendChild(createPaperTargetsDivider());

    levelRow = createSettingsRow('Level', 'Select the curriculum level.');
    segmented = createElement('div', 'igcsefy-paper-targets-segmented');
    segmented.appendChild(createLevelButton('core', 'Core', paperTargetsUiState.selectedLevel === 'core'));
    segmented.appendChild(createLevelButton('extended', 'Extended', paperTargetsUiState.selectedLevel === 'extended'));
    levelRow.control.appendChild(segmented);
    card.content.appendChild(levelRow.row);
    card.content.appendChild(createPaperTargetsDivider());

    targetRow = createSettingsRow('Target papers', 'Slide to set your goal. Rightmost = All available.', true);
    targetShell = createElement('div', 'igcsefy-paper-targets-slider-shell');
    targetHeader = createElement('div', 'igcsefy-paper-targets-slider-header');
    badge = createElement(
      'span',
      currentValue <= 0
        ? 'igcsefy-paper-targets-badge is-muted'
        : 'igcsefy-paper-targets-badge'
    );
    badgeValue = createElement('span', 'igcsefy-paper-targets-badge-text', displayValue);
    helperText = createElement('p', 'igcsefy-paper-targets-helper', getPaperTargetHelperText(currentValue));

    targetHeader.appendChild(createElement('span', 'igcsefy-paper-targets-range-edge', '0'));
    badge.appendChild(createSvgIcon('target', 'igcsefy-paper-targets-badge-icon'));
    badge.appendChild(badgeValue);
    targetHeader.appendChild(badge);
    rangeEnd = createElement(
      'span',
      'igcsefy-paper-targets-range-edge',
      availableCount > 0 ? String(availableCount) : '0'
    );
    targetHeader.appendChild(rangeEnd);

    slider = createElement('input', 'igcsefy-paper-targets-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(Math.max(availableCount, 1));
    slider.step = '1';
    slider.value = String(currentValue);
    slider.setAttribute('aria-label', 'Target papers');
    slider.disabled = availableCount <= 0;
    slider.style.setProperty(
      '--igcsefy-paper-target-progress',
      getPaperTargetProgressPercent(currentValue, paperTargetsUiState.selectedSubject, paperTargetsUiState.selectedLevel) + '%'
    );

    slider.addEventListener('input', function () {
      var value = clampPaperTargetValue(
        paperTargetsUiState.selectedSubject,
        paperTargetsUiState.selectedLevel,
        slider.value
      );
      slider.value = String(value);
      setPaperTarget(paperTargetsUiState.selectedSubject, paperTargetsUiState.selectedLevel, value, { schedule: false });
      pausePatchObserver(function () {
        slider.style.setProperty(
          '--igcsefy-paper-target-progress',
          getPaperTargetProgressPercent(value, paperTargetsUiState.selectedSubject, paperTargetsUiState.selectedLevel) + '%'
        );
        badge.classList.toggle('is-muted', value <= 0);
        badgeValue.textContent = formatPaperTargetValue(value);
        helperText.textContent = getPaperTargetHelperText(value);
      });
    });
    slider.addEventListener('change', function () {
      schedulePatch();
    });

    targetShell.appendChild(targetHeader);
    targetShell.appendChild(slider);
    targetShell.appendChild(helperText);
    targetRow.control.appendChild(targetShell);
    card.content.appendChild(targetRow.row);

    if (activeTargets.length) {
      var summary = createElement('div', 'igcsefy-paper-targets-summary');
      var summaryHeading = createElement(
        'p',
        'igcsefy-paper-targets-summary-heading',
        'Active targets'
      );
      var summaryList = createElement('div', 'igcsefy-paper-targets-summary-list');

      card.content.appendChild(createPaperTargetsDivider());
      summary.appendChild(summaryHeading);

      activeTargets.forEach(function (entry) {
        var row = createElement('div', 'igcsefy-paper-targets-target-row');
        var left = createElement('div', 'igcsefy-paper-targets-target-main');
        var name = createElement('span', 'igcsefy-paper-targets-target-name', getSubjectLabel(entry.subjectId));
        var level = createElement('span', 'igcsefy-paper-targets-target-level', entry.level);
        var right = createElement('div', 'igcsefy-paper-targets-target-meta');
        var value = createElement(
          'span',
          'igcsefy-paper-targets-target-value',
          getPaperTargetLimit(entry.subjectId, entry.level) > 0 && entry.target >= getPaperTargetLimit(entry.subjectId, entry.level)
            ? 'All'
            : String(entry.target)
        );
        var removeButton = createElement('button', 'igcsefy-paper-targets-delete');

        removeButton.type = 'button';
        removeButton.setAttribute('aria-label', 'Remove target for ' + getSubjectLabel(entry.subjectId) + ' ' + entry.level);
        removeButton.appendChild(createSvgIcon('trash', 'igcsefy-paper-targets-delete-icon'));
        removeButton.addEventListener('click', function () {
          deletePaperTarget(entry.subjectId, entry.level);
        });

        left.appendChild(name);
        left.appendChild(level);
        right.appendChild(value);
        right.appendChild(removeButton);
        row.appendChild(left);
        row.appendChild(right);
        summaryList.appendChild(row);
      });

      summary.appendChild(summaryList);
      card.content.appendChild(summary);
    }

    return card.section;
  }

  function patchPaperTargetsSection() {
    var mobileShell = document.querySelector('#root .px-4.py-8');
    var desktopHost = document.querySelector('#root main > div');
    var isActive = paperTargetsUiState.activeSection === 'paper-targets';

    if (!mobileShell && !desktopHost) return;

    if (mobileShell) {
      pausePatchObserver(function () {
        var view = mobileShell.querySelector('[data-igcsefy-paper-targets-mobile-view]');
        var children;

        if (!isActive) {
          if (view) view.remove();
          Array.from(mobileShell.children).forEach(function (child) {
            child.hidden = false;
            child.removeAttribute('aria-hidden');
          });
          return;
        }

        children = Array.from(mobileShell.children).filter(function (child) {
          return !child.hasAttribute('data-igcsefy-paper-targets-mobile-view');
        });

        children.forEach(function (child) {
          child.hidden = true;
          child.setAttribute('aria-hidden', 'true');
        });

        if (!view) {
          view = createElement('div', 'igcsefy-paper-targets-mobile-view');
          view.setAttribute('data-igcsefy-paper-targets-mobile-view', 'true');
          mobileShell.appendChild(view);
        }

        view.textContent = '';

        var backButton = createElement('button', 'igcsefy-paper-targets-back');
        backButton.type = 'button';
        backButton.setAttribute('data-igcsefy-paper-targets-back', 'true');
        backButton.appendChild(createSvgIcon('arrow-left', 'igcsefy-paper-targets-back-icon'));
        backButton.appendChild(document.createTextNode('Settings'));

        view.appendChild(backButton);
        view.appendChild(createPaperTargetsSection());
      });

      return;
    }

    pausePatchObserver(function () {
      var customSection = desktopHost.querySelector('#paper-targets[data-igcsefy-custom-section="paper-targets"]');

      Array.from(desktopHost.children).forEach(function (child) {
        if (child.id === 'paper-targets' && child.dataset.igcsefyCustomSection === 'paper-targets') {
          return;
        }

        if (isActive) {
          child.hidden = true;
          child.setAttribute('aria-hidden', 'true');
        } else {
          child.hidden = false;
          child.removeAttribute('aria-hidden');
        }
      });

      if (!isActive) {
        if (customSection) {
          customSection.remove();
        }
        return;
      }

      if (customSection) {
        customSection.remove();
      }
      desktopHost.appendChild(createPaperTargetsSection());
    });
  }

  function clearRecentSearches() {
    SEARCH_KEYS.forEach(removeStorage);
  }

  function buildExportPayload(snapshot) {
    var settings = readJson(SETTINGS_KEY) || {};
    return {
      version: '1.1.0',
      exportedAt: new Date().toISOString(),
      account: {
        isAuthenticated: authState.isAuthenticated,
        email: getDisplayUser().email,
        provider: getDisplayUser().provider
      },
      settings: settings,
      progress: snapshot || createEmptySnapshot(),
      search: {
        recent: readJson('igcsefy.home.search.recent.v1') || [],
        selections: readJson('igcsefy.home.search.selections.v1') || []
      }
    };
  }

  function downloadJson(data, filename) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  async function loadSnapshotForExport() {
    if (window.igcsefySupabase && authState.isAuthenticated && typeof window.igcsefySupabase.loadSnapshot === 'function') {
      try {
        return await window.igcsefySupabase.loadSnapshot();
      } catch (error) {
        console.error('IGCSEfy settings export failed to load snapshot:', error);
      }
    }

    if (window.igcsefyDataStore && typeof window.igcsefyDataStore.getSnapshot === 'function') {
      try {
        return window.igcsefyDataStore.getSnapshot();
      } catch (error) {
        console.error('IGCSEfy local snapshot read failed:', error);
      }
    }

    return createEmptySnapshot();
  }

  async function handleExport() {
    if (exportInFlight) return;
    exportInFlight = true;
    try {
      var snapshot = await loadSnapshotForExport();
      var filename = 'igcsefy-export-' + new Date().toISOString().split('T')[0] + '.json';
      downloadJson(buildExportPayload(snapshot), filename);
    } catch (error) {
      console.error('IGCSEfy export failed:', error);
      window.alert('Export failed. Please try again.');
    } finally {
      exportInFlight = false;
    }
  }

  async function handleReset() {
    if (resetInFlight) return;
    resetInFlight = true;

    var emptySnapshot = createEmptySnapshot();
    var resetSettings = saveSettings(SETTINGS_DEFAULTS);
    clearRecentSearches();
    removeStorage(LEGACY_PROGRESS_KEY);
    lastSettingsSyncSignature = '';

    if (window.igcsefyDataStore && typeof window.igcsefyDataStore.replaceSnapshot === 'function') {
      try {
        window.igcsefyDataStore.replaceSnapshot(emptySnapshot, 'settings-reset');
      } catch (error) {
        console.error('IGCSEfy local reset failed:', error);
      }
    }

    try {
      if (window.igcsefySupabase && authState.isAuthenticated && typeof window.igcsefySupabase.saveSnapshot === 'function') {
        await window.igcsefySupabase.saveSnapshot(emptySnapshot);
      }
      if (window.igcsefySupabase && authState.isAuthenticated && typeof window.igcsefySupabase.saveUserSettings === 'function') {
        await window.igcsefySupabase.saveUserSettings(resetSettings);
        lastSettingsSyncSignature = getSettingsSignature(loadSettings());
      }
      window.dispatchEvent(new CustomEvent('igcsefy:data-change', {
        detail: { reason: 'settings-reset', snapshot: emptySnapshot }
      }));
    } catch (error) {
      console.error('IGCSEfy remote reset failed:', error);
      window.alert('Reset completed locally, but cloud sync failed. Please refresh and try again.');
    } finally {
      resetInFlight = false;
      schedulePatch();
    }
  }

  async function handlePasswordChange() {
    var supabaseApi = window.igcsefySupabase;
    var sbUser = getSupabaseUser();

    if (!supabaseApi || !sbUser || !authState.isAuthenticated || !supabaseApi.client || !supabaseApi.client.auth) {
      window.location.href = '/profile/';
      return;
    }

    if (getProviderMode(sbUser) === 'google') {
      window.alert('This account signs in with Google. Password changes are managed through Google.');
      return;
    }

    var nextPassword = window.prompt('Enter a new password for your IGCSEfy account (minimum 8 characters):');
    if (nextPassword == null) return;
    nextPassword = String(nextPassword).trim();
    if (nextPassword.length < 8) {
      window.alert('Password must be at least 8 characters long.');
      return;
    }

    var confirmPassword = window.prompt('Confirm your new password:');
    if (confirmPassword == null) return;
    if (confirmPassword !== nextPassword) {
      window.alert('Passwords did not match.');
      return;
    }

    try {
      var result = await supabaseApi.client.auth.updateUser({ password: nextPassword });
      if (result && result.error) throw result.error;
      window.alert('Password updated successfully.');
    } catch (error) {
      console.error('IGCSEfy password update failed:', error);
      window.alert((error && error.message) || 'Password update failed.');
    }
  }

  function handleHelpAction(label) {
    var action = HELP_ACTIONS[label];
    if (!action) return;
    var href = 'mailto:' + encodeURIComponent(SUPPORT_EMAIL)
      + '?subject=' + encodeURIComponent(action.subject)
      + '&body=' + encodeURIComponent(action.body);
    window.location.href = href;
  }

  function stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }

  function schedulePatch() {
    if (patchQueued) return;
    patchQueued = true;
    window.requestAnimationFrame(function () {
      patchQueued = false;
      patchHeaderCopy();
      patchLegalLinks();
      patchPaperTargetsNav();
      patchPaperTargetsSection();
      patchAccountSection();
      patchSyncStatus();
      patchStudyPreferencesSection();
      syncStoredSettingsIfNeeded();
    });
  }

  function startObserver() {
    if (patchObserver) return;
    var root = document.getElementById('root');
    if (!root) return;

    patchObserver = new MutationObserver(function () {
      schedulePatch();
    });
    patchObserver.observe(root, PATCH_OBSERVER_OPTIONS);
  }

  function onDocumentClick(event) {
    var control = event.target && event.target.closest ? event.target.closest('button, a') : null;
    var disabledMarkSchemeRow = event.target && event.target.closest
      ? event.target.closest('.igcsefy-mark-scheme-row--disabled')
      : null;
    var studyPreferencesControl;
    var settingsNavControl;

    if (disabledMarkSchemeRow) {
      stopEvent(event);
      return;
    }

    if (!control) return;

    studyPreferencesControl = control.closest('#study-preferences');
    if (studyPreferencesControl) {
      var studyLabel = String(control.textContent || '').trim().toLowerCase();
      if (studyLabel === 'direct download') {
        window.setTimeout(function () {
          updateStudyPreferences({
            pdfOpeningMode: 'direct-download',
            autoOpenMarkScheme: false,
            markSchemeOpenBehavior: 'same-tab'
          });
        }, 0);
      } else if (studyLabel === 'preview first') {
        window.setTimeout(schedulePatch, 0);
      } else if (studyLabel === 'same tab' || studyLabel === 'side by side') {
        window.setTimeout(schedulePatch, 0);
      }
    }

    if (control.hasAttribute('data-igcsefy-paper-targets-back')) {
      stopEvent(event);
      paperTargetsUiState.activeSection = '';
      schedulePatch();
      return;
    }

    settingsNavControl = control.closest('#root nav button');
    if (settingsNavControl) {
      if (settingsNavControl.dataset.igcsefySettingsNav === 'paper-targets') {
        stopEvent(event);
        paperTargetsUiState.activeSection = 'paper-targets';
        schedulePatch();
        return;
      }

      if (paperTargetsUiState.activeSection === 'paper-targets') {
        paperTargetsUiState.activeSection = '';
      }
    }

    var label = String(control.textContent || '').trim();
    if (!label) return;

    if (label === 'Export' && control.closest('#data-privacy')) {
      stopEvent(event);
      handleExport();
      return;
    }

    if ((label === 'Clear' || label === 'Cleared') && control.closest('#data-privacy')) {
      window.setTimeout(clearRecentSearches, 0);
      return;
    }

    if (label === 'Reset everything' && control.closest('[role="alertdialog"]')) {
      window.setTimeout(handleReset, 0);
      return;
    }

    if (label === 'Change password') {
      stopEvent(event);
      handlePasswordChange();
      return;
    }

    if (label === 'Sign out' || label === 'Sign in') {
      stopEvent(event);
      if (authState.isAuthenticated && window.igcsefySupabase && typeof window.igcsefySupabase.signOut === 'function') {
        window.igcsefySupabase.signOut().finally(function () {
          window.location.reload();
        });
      } else {
        window.location.href = '/profile/';
      }
      return;
    }

    if (Object.prototype.hasOwnProperty.call(HELP_ACTIONS, label)) {
      stopEvent(event);
      handleHelpAction(label);
    }
  }

  function syncAuthState(detail) {
    authState.user = detail && detail.user ? detail.user : getSupabaseUser();
    authState.isAuthenticated = !!(detail && detail.isAuthenticated) || !!authState.user;

    if (authState.isAuthenticated) {
      var cached = window.igcsefyUser && typeof window.igcsefyUser.get === 'function'
        ? window.igcsefyUser.get()
        : null;

      if (cached) {
        syncAccountStorageFromIdentity(cached);
      } else if (authState.user) {
        syncAccountStorageFromIdentity({
          name: (authState.user.user_metadata && (authState.user.user_metadata.full_name || authState.user.user_metadata.name)) || authState.user.email || ACCOUNT_DEFAULTS.name,
          email: authState.user.email || ACCOUNT_DEFAULTS.email,
          avatar: getSupabaseAvatar(authState.user)
        });
      }

      lastSettingsSyncSignature = getSettingsSignature(loadSettings());
    }

    schedulePatch();
  }

  window.addEventListener('igcsefy:supabase-auth-change', function (event) {
    syncAuthState(event.detail || null);
  });

  window.addEventListener('igcsefy:user-ready', function (event) {
    var user = event && event.detail ? event.detail.user : null;
    if (authState.isAuthenticated && user) {
      syncAccountStorageFromIdentity(user);
    }
    schedulePatch();
  });

  window.addEventListener('igcsefy:settings-sync', function () {
    lastSettingsSyncSignature = getSettingsSignature(loadSettings());
    schedulePatch();
  });

  document.addEventListener('click', onDocumentClick, true);
  window.addEventListener('resize', schedulePatch);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      loadPaperTargetSubjects();
      syncAuthState(null);
      startObserver();
      schedulePatch();
    }, { once: true });
  } else {
    loadPaperTargetSubjects();
    syncAuthState(null);
    startObserver();
    schedulePatch();
  }
})();
