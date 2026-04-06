// IGCSEfy Profile Progress Patch
// Syncs profile dashboard target values with the saved paper-target settings.
(function () {
  'use strict';

  var SETTINGS_KEY = 'igcsefy-settings';
  var SUBJECTS_BY_CODE = {
    '0450': { slug: 'business-studies-0450', hasDistinctLevels: false },
    '0452': { slug: 'accounting-0452', hasDistinctLevels: false },
    '0455': { slug: 'economics-0455', hasDistinctLevels: false },
    '0266': { slug: 'psychology-0266', hasDistinctLevels: false },
    '0478': { slug: 'computer-science-0478', hasDistinctLevels: false },
    '0495': { slug: 'sociology-0495', hasDistinctLevels: false },
    '0500': { slug: 'english-first-language-0500', hasDistinctLevels: false },
    '0510': { slug: 'english-as-a-second-language-0510', hasDistinctLevels: false },
    '0580': { slug: 'mathematics-0580', hasDistinctLevels: true },
    '0610': { slug: 'biology-0610', hasDistinctLevels: true },
    '0620': { slug: 'chemistry-0620', hasDistinctLevels: true },
    '0625': { slug: 'physics-0625', hasDistinctLevels: true }
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

  var refreshTimer = 0;
  var rootObserver = null;

  function isLightTheme() {
    return document.documentElement.classList.contains('light');
  }

  function getProgressTheme() {
    return isLightTheme()
      ? { track: '#E9E3D8', fill: '#000000' }
      : { track: '#1E1E1E', fill: '#ECEADD' };
  }

  function getStore() {
    return window.igcsefyDataStore || null;
  }

  function readJson(key) {
    try {
      return JSON.parse(window.localStorage.getItem(key) || 'null');
    } catch (error) {
      return null;
    }
  }

  function normalizePaperTargetSubjectId(subjectId) {
    var normalized = typeof subjectId === 'string' ? subjectId.trim() : '';
    if (!normalized) return '';
    if (Object.prototype.hasOwnProperty.call(LEGACY_PAPER_TARGET_SUBJECT_IDS, normalized)) {
      return LEGACY_PAPER_TARGET_SUBJECT_IDS[normalized];
    }
    return normalized;
  }

  function sanitizePaperTarget(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var subjectId = normalizePaperTargetSubjectId(raw.subjectId);
    var level = raw.level === 'core' ? 'core' : raw.level === 'extended' ? 'extended' : '';
    var target = Number(raw.target);

    if (!subjectId || !level || !Number.isFinite(target)) {
      return null;
    }

    target = Math.max(0, Math.round(target));
    if (target <= 0) return null;

    return {
      subjectId: subjectId,
      level: level,
      target: target
    };
  }

  function getPaperTargets() {
    var settings = readJson(SETTINGS_KEY) || {};
    var studyPreferences = settings && settings.studyPreferences && typeof settings.studyPreferences === 'object'
      ? settings.studyPreferences
      : {};
    var rawTargets = Array.isArray(studyPreferences.paperTargets) ? studyPreferences.paperTargets : [];
    var targetsByKey = {};

    rawTargets.forEach(function (entry) {
      var target = sanitizePaperTarget(entry);
      if (!target) return;
      targetsByKey[target.subjectId + ':' + target.level] = target;
    });

    return Object.keys(targetsByKey).map(function (key) {
      return targetsByKey[key];
    });
  }

  function getSubjectMeta(subject) {
    var code = '';
    var slug = '';
    var level = '';
    var hasDistinctLevels = false;
    var fallback;

    if (subject && typeof subject === 'object') {
      code = String(subject.code || '').trim();
      slug = String(subject.slug || subject.subjectSlug || '').trim();
      level = subject.level === 'core' ? 'core' : subject.level === 'extended' ? 'extended' : '';
      hasDistinctLevels = !!subject.hasDistinctLevels;
    } else {
      code = String(subject || '').trim();
    }

    fallback = SUBJECTS_BY_CODE[code] || null;
    if (!slug && fallback) {
      slug = fallback.slug;
    }
    if (!hasDistinctLevels && fallback) {
      hasDistinctLevels = !!fallback.hasDistinctLevels;
    }

    return {
      code: code,
      slug: slug,
      level: level,
      hasDistinctLevels: hasDistinctLevels
    };
  }

  function getPaperTargetForSubject(subject, paperTargets) {
    var meta = getSubjectMeta(subject);
    var targets = Array.isArray(paperTargets) ? paperTargets : getPaperTargets();
    var levels = [];
    var match = null;
    var i;

    if (!meta.slug) return 0;

    if (meta.level === 'core' || meta.level === 'extended') {
      levels.push(meta.level);
    }
    if (levels.indexOf('extended') === -1) {
      levels.push('extended');
    }
    if (levels.indexOf('core') === -1) {
      levels.push('core');
    }

    for (i = 0; i < levels.length; i += 1) {
      match = targets.find(function (entry) {
        return entry.subjectId === meta.slug && entry.level === levels[i];
      });
      if (match) {
        return match.target;
      }
    }

    return 0;
  }

  function createEmptySummary() {
    return {
      completed: 0,
      inProgress: 0,
      reviewed: 0,
      target: 0
    };
  }

  function createSummaryForSubject(subject, paperTargets) {
    var summary = createEmptySummary();
    summary.target = getPaperTargetForSubject(subject, paperTargets);
    return summary;
  }

  function buildSubjectSummaries() {
    var store = getStore();
    var summaries = {};
    var snapshot;
    var trackedSubjects;
    var paperStates;
    var paperTargets;

    if (!store) return summaries;

    snapshot = store.getSnapshot ? (store.getSnapshot() || {}) : {};
    trackedSubjects = Array.isArray(snapshot.trackedSubjects) ? snapshot.trackedSubjects : [];
    paperStates = store.getPastPaperStatuses ? (store.getPastPaperStatuses() || {}) : {};
    paperTargets = getPaperTargets();

    trackedSubjects.forEach(function (subject) {
      var meta = getSubjectMeta(subject);
      if (!meta.code) return;
      summaries[meta.code] = createSummaryForSubject(subject, paperTargets);
    });

    Object.keys(paperStates).forEach(function (key) {
      var status = paperStates[key];
      var parts = String(key || '').split('|');
      var code = parts.length >= 2 ? String(parts[1] || '').trim() : '';

      if (!code) return;
      if (!summaries[code]) {
        summaries[code] = createSummaryForSubject({ code: code }, paperTargets);
      }

      if (status === 'done') {
        summaries[code].completed += 1;
      } else if (status === 'in_progress') {
        summaries[code].inProgress += 1;
      } else if (status === 'reviewed') {
        summaries[code].reviewed += 1;
      }
    });

    return summaries;
  }

  function getSubjectCodeFromNode(node) {
    var spans = node.querySelectorAll('span');
    var i;

    for (i = 0; i < spans.length; i += 1) {
      var text = (spans[i].textContent || '').trim();
      if (/^\d{4}$/.test(text)) {
        return text;
      }
    }

    return '';
  }

  function getSubjectCards() {
    var cards = [];
    var seen = new Set();

    document.querySelectorAll('#root button').forEach(function (button) {
      if ((button.textContent || '').trim() !== 'Remove') return;
      var card = button.closest('div.rounded-xl');
      if (!card || seen.has(card)) return;
      seen.add(card);
      cards.push(card);
    });

    return cards;
  }

  function getOverviewRows() {
    var rows = [];

    document.querySelectorAll('#root .grid[style*="grid-template-columns: 1fr 80px 80px 80px 80px 60px"]').forEach(function (row) {
      if (!getSubjectCodeFromNode(row)) return;
      rows.push(row);
    });

    return rows;
  }

  function getCompletionPercentage(summary) {
    return summary.target > 0
      ? Math.min(Math.round((summary.completed / summary.target) * 100), 100)
      : 0;
  }

  function patchSummaryChips(card, summary) {
    var valuesByLabel = {
      done: summary.completed,
      active: summary.inProgress,
      reviewed: summary.reviewed,
      target: summary.target
    };

    card.querySelectorAll('span').forEach(function (span) {
      var text = (span.textContent || '').trim().toLowerCase();
      if (!text || !span.firstElementChild || span.firstElementChild.tagName !== 'SPAN') return;

      Object.keys(valuesByLabel).forEach(function (label) {
        if (!text.endsWith(label)) return;
        span.firstElementChild.textContent = String(valuesByLabel[label]);
      });
    });
  }

  function patchExpandedStats(card, summary) {
    var valuesByLabel = {
      Done: summary.completed,
      Active: summary.inProgress,
      Reviewed: summary.reviewed,
      Target: summary.target
    };

    card.querySelectorAll('span').forEach(function (span) {
      var label = (span.textContent || '').trim();
      var valueNode;

      if (!Object.prototype.hasOwnProperty.call(valuesByLabel, label)) return;

      valueNode = span.previousElementSibling;
      if (!valueNode || valueNode.tagName !== 'SPAN') return;
      if (!/^\d+$/.test((valueNode.textContent || '').trim())) return;

      valueNode.textContent = String(valuesByLabel[label]);
    });
  }

  function patchProgressRing(card, summary) {
    var pct = getCompletionPercentage(summary);
    var percentLabelPatched = false;
    var svgs;
    var i;

    card.querySelectorAll('span').forEach(function (span) {
      if (percentLabelPatched) return;
      if (!/^\d+%$/.test((span.textContent || '').trim())) return;
      span.textContent = String(pct) + '%';
      percentLabelPatched = true;
    });

    svgs = card.querySelectorAll('svg');
    for (i = 0; i < svgs.length; i += 1) {
      var circles = svgs[i].querySelectorAll('circle');
      var progressCircle;
      var radius;
      var circumference;

      if (circles.length !== 2) continue;

      progressCircle = circles[1];
      radius = parseFloat(progressCircle.getAttribute('r') || '0');
      if (!radius) break;

      circumference = 2 * Math.PI * radius;
      progressCircle.setAttribute('stroke-dasharray', String(circumference));
      progressCircle.setAttribute('stroke-dashoffset', String(circumference - (pct / 100) * circumference));
      break;
    }
  }

  function nodeHasClasses(node, classNames) {
    var i;

    if (!node || !node.classList || !Array.isArray(classNames)) return false;

    for (i = 0; i < classNames.length; i += 1) {
      if (!node.classList.contains(classNames[i])) {
        return false;
      }
    }

    return true;
  }

  function getOverviewProgressTrack(row) {
    var children = row && row.children;
    var subjectCell = children && children.length ? children[0] : null;
    var subjectChildren;
    var i;

    if (!subjectCell || subjectCell.tagName !== 'DIV') return null;

    subjectChildren = subjectCell.children;
    for (i = 0; i < subjectChildren.length; i += 1) {
      if (!nodeHasClasses(subjectChildren[i], ['relative', 'w-full', 'h-[2px]', 'rounded-full'])) {
        continue;
      }
      return subjectChildren[i];
    }

    return null;
  }

  function getOverviewProgressFill(row) {
    var progressTrack = getOverviewProgressTrack(row);
    var trackChildren;
    var i;

    if (!progressTrack) return null;

    trackChildren = progressTrack.children;
    for (i = 0; i < trackChildren.length; i += 1) {
      if (!nodeHasClasses(trackChildren[i], ['absolute', 'left-0', 'top-0', 'h-full', 'rounded-full'])) {
        continue;
      }
      return trackChildren[i];
    }

    return null;
  }

  function resetOverviewRogueWidths(row, keepNode) {
    row.querySelectorAll('div.absolute').forEach(function (node) {
      var width = node && node.style ? String(node.style.width || '').trim() : '';
      var parent = node ? node.parentElement : null;

      if (!node || node === keepNode) return;
      if (!/^\d+%$/.test(width)) return;
      if (nodeHasClasses(parent, ['relative', 'w-full', 'h-[2px]', 'rounded-full'])) return;

      node.style.width = '';
    });
  }

  function patchOverviewRow(row, summary) {
    var pct = getCompletionPercentage(summary);
    var theme = getProgressTheme();
    var children = row.children;
    var targetNode;
    var percentNode;
    var progressTrack;
    var progressFill;

    if (!children || children.length < 6) return;

    targetNode = children[4];
    percentNode = children[5];
    progressTrack = getOverviewProgressTrack(row);
    progressFill = getOverviewProgressFill(row);

    if (targetNode) {
      targetNode.textContent = String(summary.target);
    }
    if (percentNode) {
      percentNode.textContent = String(pct) + '%';
    }
    if (progressTrack) {
      progressTrack.style.position = 'relative';
      progressTrack.style.width = '100%';
      progressTrack.style.height = '2px';
      progressTrack.style.overflow = 'hidden';
      progressTrack.style.background = theme.track;
      progressTrack.style.borderRadius = '9999px';
    }
    if (progressFill) {
      progressFill.style.position = 'absolute';
      progressFill.style.left = '0';
      progressFill.style.top = '0';
      progressFill.style.right = 'auto';
      progressFill.style.bottom = 'auto';
      progressFill.style.height = '100%';
      progressFill.style.maxWidth = '100%';
      progressFill.style.background = theme.fill;
      progressFill.style.borderRadius = '9999px';
      progressFill.style.width = pct + '%';
    }
    resetOverviewRogueWidths(row, progressFill);
  }

  function patchProfileProgress() {
    var summaries = buildSubjectSummaries();

    getSubjectCards().forEach(function (card) {
      var code = getSubjectCodeFromNode(card);
      var summary;

      if (!code) return;

      summary = summaries[code] || createEmptySummary();
      patchSummaryChips(card, summary);
      patchExpandedStats(card, summary);
      patchProgressRing(card, summary);
    });

    getOverviewRows().forEach(function (row) {
      var code = getSubjectCodeFromNode(row);
      if (!code) return;
      patchOverviewRow(row, summaries[code] || createEmptySummary());
    });
  }

  function scheduleProfileProgressPatch() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(function () {
      refreshTimer = 0;
      try {
        patchProfileProgress();
      } catch (err) {
        console.error('IGCSEfy profile subject patch failed:', err);
      }
    }, 60);
  }

  function startObserver() {
    if (rootObserver) return;
    var root = document.getElementById('root');
    if (!root) return;

    rootObserver = new MutationObserver(function () {
      scheduleProfileProgressPatch();
    });
    rootObserver.observe(root, { childList: true, subtree: true });
  }

  window.addEventListener('igcsefy:data-change', function (e) {
    var reason = e.detail && e.detail.reason;
    if (reason === 'remote-load' || reason === 'remote-update' || reason === 'auth-dashboard-nudge') {
      // Fire a second nudge after 200ms to ensure React has re-mounted its listeners
      setTimeout(function () {
        try {
          window.dispatchEvent(new CustomEvent('igcsefy:data-change', {
            detail: { reason: 'profile-patch-nudge' }
          }));
        } catch (err) {}
      }, 200);
    }

    scheduleProfileProgressPatch();
  });

  window.addEventListener('igcsefy:tracker-change', scheduleProfileProgressPatch);
  window.addEventListener('storage', function (event) {
    if (!event || event.key === SETTINGS_KEY || event.key === null) {
      scheduleProfileProgressPatch();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      startObserver();
      scheduleProfileProgressPatch();
    });
  } else {
    startObserver();
    scheduleProfileProgressPatch();
  }
})();
