(function () {
  'use strict';

  if (document.body == null || document.body.getAttribute('data-profile-page') !== 'true') {
    return;
  }

  var STYLE_ID = 'igcsefy-profile-subject-selector-style';
  var observer = null;
  var scheduled = false;
  var clickRefreshBound = false;
  var TIERED_SUBJECT_CODES = {
    '0580': true,
    '0610': true,
    '0620': true,
    '0625': true
  };
  var SUBJECT_GROUP_LABELS = {
    'Sciences & Maths': true,
    'Languages': true,
    'Humanities': true,
    'Technology': true
  };
  var SUBJECT_SLUG_BY_CODE = {
    '0266': 'psychology-0266',
    '0450': 'business-studies-0450',
    '0452': 'accounting-0452',
    '0455': 'economics-0455',
    '0478': 'computer-science-0478',
    '0495': 'sociology-0495',
    '0500': 'english-first-language-0500',
    '0510': 'english-as-a-second-language-0510',
    '0580': 'mathematics-0580',
    '0610': 'biology-0610',
    '0620': 'chemistry-0620',
    '0625': 'physics-0625'
  };
  var TRACKING_FILTER_PATCH_FLAG = '__igcsefyProfileTrackingFilterPatched';

  function ensureStyles() {
    var style;

    if (document.getElementById(STYLE_ID)) {
      return;
    }

    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'button[data-igcsefy-profile-subject-card="true"] {',
      '  position: relative;',
      '  display: flex !important;',
      '  align-items: flex-start !important;',
      '  gap: 16px !important;',
      '  width: 100% !important;',
      '  padding: 18px !important;',
      '  border-radius: 22px !important;',
      '  text-align: left !important;',
      '  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease !important;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] {',
      '  background: #FFFDF8 !important;',
      '  border: 1px solid #E6DECF !important;',
      '  box-shadow: none !important;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"][data-selected="true"] {',
      '  border-color: #C7B59E !important;',
      '  box-shadow: 0 10px 24px rgba(122, 102, 73, 0.08) !important;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"]:hover {',
      '  border-color: #E6DECF !important;',
      '  box-shadow: 0 12px 26px rgba(122, 102, 73, 0.10) !important;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"] {',
      '  background: #111111 !important;',
      '  border: 1px solid #1A1A1A !important;',
      '  box-shadow: none !important;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"][data-selected="true"] {',
      '  border-color: #2A2A2A !important;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"]:hover {',
      '  border-color: #242424 !important;',
      '}',
      '[data-igcsefy-subject-card-check] {',
      '  width: 34px;',
      '  height: 34px;',
      '  margin-top: 2px;',
      '  border-radius: 10px;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  flex-shrink: 0;',
      '  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] [data-igcsefy-subject-card-check] {',
      '  background: transparent;',
      '  border: 1px solid #CDBDA7;',
      '  color: #1F1A14;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"][data-selected="true"] [data-igcsefy-subject-card-check] {',
      '  background: #A89272;',
      '  border-color: #A89272;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"] [data-igcsefy-subject-card-check] {',
      '  background: transparent;',
      '  border: 1px solid #2A2A2A;',
      '  color: #ECEADD;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"][data-selected="true"] [data-igcsefy-subject-card-check] {',
      '  background: #ECEADD;',
      '  border-color: #ECEADD;',
      '  color: #0B0B0F;',
      '}',
      '[data-igcsefy-subject-card-body] {',
      '  flex: 1 1 auto;',
      '  min-width: 0;',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 12px;',
      '}',
      '[data-igcsefy-subject-card-heading] {',
      '  display: flex;',
      '  align-items: baseline;',
      '  justify-content: space-between;',
      '  gap: 12px;',
      '}',
      '[data-igcsefy-subject-card-name] {',
      '  display: block;',
      '  min-width: 0;',
      '  font-size: 15px;',
      '  font-weight: 700;',
      '  letter-spacing: -0.01em;',
      '  line-height: 1.2;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] [data-igcsefy-subject-card-name] {',
      '  color: #1F1A14;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"] [data-igcsefy-subject-card-name] {',
      '  color: #ECEADD;',
      '}',
      '[data-igcsefy-subject-card-code] {',
      '  flex-shrink: 0;',
      '  font-size: 11px;',
      '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] [data-igcsefy-subject-card-code] {',
      '  color: #8E7A63;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"] [data-igcsefy-subject-card-code] {',
      '  color: #555555;',
      '}',
      '[data-igcsefy-subject-card-levels] {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 4px;',
      '  width: fit-content;',
      '  padding: 4px;',
      '  border-radius: 999px;',
      '  transition: opacity 0.18s ease, filter 0.18s ease;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] [data-igcsefy-subject-card-levels] {',
      '  background: #F3EEE4;',
      '  border: 1px solid #E8DFD2;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"] [data-igcsefy-subject-card-levels] {',
      '  background: #161616;',
      '  border: 1px solid #1F1F1F;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-selected="false"] [data-igcsefy-subject-card-levels] {',
      '  opacity: 0.58;',
      '  filter: saturate(0.45);',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-tiered="false"] [data-igcsefy-subject-card-levels] {',
      '  display: none;',
      '}',
      '[data-igcsefy-subject-level] {',
      '  min-width: 110px;',
      '  border: 0;',
      '  border-radius: 999px;',
      '  padding: 12px 18px;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  font-size: 11px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.18em;',
      '  text-transform: uppercase;',
      '  line-height: 1;',
      '  user-select: none;',
      '  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-selected="false"] [data-igcsefy-subject-level] {',
      '  pointer-events: none;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] [data-igcsefy-subject-level] {',
      '  color: #B3A593;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"] [data-igcsefy-subject-level] {',
      '  color: #4A4A4A;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"][data-selected="true"] [data-igcsefy-subject-level][data-active="true"] {',
      '  background: #2B241D;',
      '  color: #FFF8EF;',
      '  box-shadow: 0 8px 16px rgba(24, 18, 12, 0.14);',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"][data-selected="true"] [data-igcsefy-subject-level][data-active="false"] {',
      '  color: #8E7A63;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"][data-selected="true"] [data-igcsefy-subject-level][data-active="true"] {',
      '  background: #ECEADD;',
      '  color: #0B0B0F;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"][data-selected="true"] [data-igcsefy-subject-level][data-active="false"] {',
      '  color: #777777;',
      '}',
      '@media (max-width: 640px) {',
      '  button[data-igcsefy-profile-subject-card="true"] {',
      '    padding: 16px !important;',
      '    gap: 14px !important;',
      '  }',
      '  [data-igcsefy-subject-level] {',
      '    min-width: 96px;',
      '    padding: 11px 14px;',
      '    letter-spacing: 0.14em;',
      '  }',
      '}',
      'button[data-igcsefy-basic-subject-option="true"] {',
      '  display: flex !important;',
      '  align-items: center !important;',
      '  gap: 12px !important;',
      '  width: 100% !important;',
      '  padding: 12px 16px !important;',
      '  border-radius: 16px !important;',
      '  text-align: left !important;',
      '  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="dark"] {',
      '  background: #0F0F0F !important;',
      '  border: 1px solid #161616 !important;',
      '  box-shadow: none !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="dark"][data-selected="true"] {',
      '  background: #161616 !important;',
      '  border-color: #2E2E2E !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="dark"]:hover {',
      '  border-color: #242424 !important;',
      '  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18) !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"] {',
      '  background: #FFFDF8 !important;',
      '  border: 1px solid #E6DECF !important;',
      '  box-shadow: none !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"][data-selected="true"] {',
      '  border-color: #C7B59E !important;',
      '  box-shadow: 0 10px 24px rgba(122, 102, 73, 0.08) !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"]:hover {',
      '  border-color: #E6DECF !important;',
      '  box-shadow: 0 12px 26px rgba(122, 102, 73, 0.10) !important;',
      '}',
      '[data-igcsefy-basic-subject-check] {',
      '  width: 16px;',
      '  height: 16px;',
      '  border-radius: 4px;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  flex-shrink: 0;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="dark"] [data-igcsefy-basic-subject-check] {',
      '  background: transparent !important;',
      '  border: 1px solid #2A2A2A !important;',
      '  color: #ECEADD !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="dark"][data-selected="true"] [data-igcsefy-basic-subject-check] {',
      '  background: #ECEADD !important;',
      '  border-color: #ECEADD !important;',
      '  color: #0B0B0F !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"] [data-igcsefy-basic-subject-check] {',
      '  background: transparent !important;',
      '  border: 1px solid #CDBDA7 !important;',
      '  color: #1F1A14 !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"][data-selected="true"] [data-igcsefy-basic-subject-check] {',
      '  background: #A89272 !important;',
      '  border-color: #A89272 !important;',
      '  color: #1F1A14 !important;',
      '}',
      '[data-igcsefy-basic-subject-check] svg path {',
      '  stroke: currentColor !important;',
      '}',
      '[data-igcsefy-basic-subject-body] {',
      '  min-width: 0;',
      '  flex: 1 1 auto;',
      '}',
      '[data-igcsefy-basic-subject-name] {',
      '  display: block;',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  line-height: 1.2;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="dark"] [data-igcsefy-basic-subject-name] {',
      '  color: #555555 !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="dark"][data-selected="true"] [data-igcsefy-basic-subject-name] {',
      '  color: #ECEADD !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"] [data-igcsefy-basic-subject-name] {',
      '  color: #746A5E !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"][data-selected="true"] [data-igcsefy-basic-subject-name] {',
      '  color: #1F1A14 !important;',
      '}',
      '[data-igcsefy-basic-subject-code] {',
      '  flex-shrink: 0;',
      '  font-size: 10px;',
      '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="dark"] [data-igcsefy-basic-subject-code] {',
      '  color: #252525 !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"] [data-igcsefy-basic-subject-code] {',
      '  color: #8E7A63 !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-toggle="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-toggle="true"] {',
      '  background: #FFFDF8 !important;',
      '  color: #1F1A14 !important;',
      '  border: 1px solid #CDBDA7 !important;',
      '  box-shadow: none !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-toggle="true"][data-open="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-toggle="true"][data-open="true"] {',
      '  background: #E7DDCF !important;',
      '  color: #1F1A14 !important;',
      '  border-color: #C7B59E !important;',
      '}',
      'html.light [data-igcsefy-subject-manager="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager="true"] {',
      '  background: #FFFDF8 !important;',
      '  border: 1px solid #E6DECF !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-header="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-header="true"] {',
      '  background: #FFFDF8 !important;',
      '  border-bottom: 1px solid #E6DECF !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-search="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-search="true"] {',
      '  background: #FFFDF8 !important;',
      '  border-right: 1px solid #E6DECF !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-search-icon="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-search-icon="true"] {',
      '  color: #8E7A63 !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-search-input="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-search-input="true"] {',
      '  color: #1F1A14 !important;',
      '  caret-color: #1F1A14 !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-search-input="true"]::placeholder,',
      'html[data-theme="light"] [data-igcsefy-subject-manager-search-input="true"]::placeholder {',
      '  color: #8E7A63 !important;',
      '  opacity: 1 !important;',
      '}',
      'html.light [data-igcsefy-subject-group-pill="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-group-pill="true"] {',
      '  background: #FBF7EF !important;',
      '  color: #746A5E !important;',
      '  border: 1px solid #E6DECF !important;',
      '  box-shadow: none !important;',
      '}',
      'html.light [data-igcsefy-subject-group-pill="true"][data-active="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-group-pill="true"][data-active="true"] {',
      '  background: #E7DDCF !important;',
      '  color: #1F1A14 !important;',
      '  border-color: #C7B59E !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-footer="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-footer="true"] {',
      '  border-top: 1px solid #E6DECF !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-summary="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-summary="true"] {',
      '  color: #746A5E !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-summary="true"] span,',
      'html[data-theme="light"] [data-igcsefy-subject-manager-summary="true"] span {',
      '  color: #1F1A14 !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-confirm="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-confirm="true"] {',
      '  background: #1F1A14 !important;',
      '  color: #FFFDF8 !important;',
      '  border: 1px solid #1F1A14 !important;',
      '  opacity: 1 !important;',
      '}',
      'html.light [data-igcsefy-subject-empty-hint="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-empty-hint="true"] {',
      '  color: #746A5E !important;',
      '}',
      'html.light [data-igcsefy-subject-empty-action="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-empty-action="true"] {',
      '  color: #1F1A14 !important;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function isLightTheme() {
    var root = document.documentElement;
    return root.classList.contains('light') || root.dataset.theme === 'light';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getStore() {
    return window.igcsefyDataStore || null;
  }

  function getTrackedCodes(snapshot) {
    var trackedSubjects = snapshot && Array.isArray(snapshot.trackedSubjects)
      ? snapshot.trackedSubjects
      : [];

    return trackedSubjects
      .map(function (subject) {
        return String(subject && subject.code ? subject.code : subject || '').trim();
      })
      .filter(Boolean);
  }

  function buildTrackedSubjectsFromCodes(codes) {
    return codes.map(function (code) {
      var subject = { code: code };

      if (TIERED_SUBJECT_CODES[code]) {
        subject.level = getSubjectLevel(code);
      }

      return subject;
    });
  }

  function sameCodeList(a, b) {
    var left;
    var right;
    var i;

    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }

    if (a.length !== b.length) {
      return false;
    }

    left = a.slice().sort();
    right = b.slice().sort();
    for (i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) {
        return false;
      }
    }

    return true;
  }

  function persistTrackedSelection(code, selected) {
    var store = getStore();
    var snapshot;
    var currentCodes;
    var nextCodes;

    if (!store || typeof store.getSnapshot !== 'function' || typeof store.setTrackedSubjects !== 'function') {
      return;
    }

    snapshot = store.getSnapshot() || {};
    currentCodes = getTrackedCodes(snapshot);
    nextCodes = currentCodes.slice();

    if (selected) {
      if (nextCodes.indexOf(code) === -1) {
        nextCodes.push(code);
      }
    } else {
      nextCodes = nextCodes.filter(function (entry) {
        return entry !== code;
      });
    }

    if (sameCodeList(currentCodes, nextCodes)) {
      return;
    }

    store.setTrackedSubjects(buildTrackedSubjectsFromCodes(nextCodes));
  }

  function filterSyllabusStatesByTrackedSubjects(states) {
    var store = getStore();
    var snapshot = store && typeof store.getSnapshot === 'function' ? (store.getSnapshot() || {}) : {};
    var trackedCodes = getTrackedCodes(snapshot);
    var allowedSlugs = new Set(
      trackedCodes
        .map(function (code) { return SUBJECT_SLUG_BY_CODE[code] || ''; })
        .filter(Boolean)
    );
    var filtered = {};

    Object.keys(states || {}).forEach(function (key) {
      var slug = String(key || '').split('::')[0];
      if (allowedSlugs.has(slug)) {
        filtered[key] = states[key];
      }
    });

    return filtered;
  }

  function filterPastPaperStatusesByTrackedSubjects(statuses) {
    var store = getStore();
    var snapshot = store && typeof store.getSnapshot === 'function' ? (store.getSnapshot() || {}) : {};
    var trackedCodes = new Set(getTrackedCodes(snapshot));
    var filtered = {};

    Object.keys(statuses || {}).forEach(function (key) {
      var parts = String(key || '').split('|');
      var code = parts.length >= 2 ? String(parts[1] || '').trim() : '';
      if (trackedCodes.has(code)) {
        filtered[key] = statuses[key];
      }
    });

    return filtered;
  }

  function applyTrackedSubjectFilters() {
    var store = getStore();
    var originalGetSyllabusStates;
    var originalGetPastPaperStatuses;

    if (!store || store[TRACKING_FILTER_PATCH_FLAG]) {
      return;
    }

    originalGetSyllabusStates = typeof store.getSyllabusStates === 'function'
      ? store.getSyllabusStates.bind(store)
      : null;
    originalGetPastPaperStatuses = typeof store.getPastPaperStatuses === 'function'
      ? store.getPastPaperStatuses.bind(store)
      : null;

    if (originalGetSyllabusStates) {
      store.getSyllabusStates = function () {
        return filterSyllabusStatesByTrackedSubjects(originalGetSyllabusStates());
      };
    }

    if (originalGetPastPaperStatuses) {
      store.getPastPaperStatuses = function () {
        return filterPastPaperStatusesByTrackedSubjects(originalGetPastPaperStatuses());
      };
    }

    store[TRACKING_FILTER_PATCH_FLAG] = true;

    try {
      window.dispatchEvent(new CustomEvent('igcsefy:data-change', {
        detail: { reason: 'profile-tracked-subject-filter' }
      }));
    } catch (error) {}
  }

  function getSubjectLevel(code) {
    var store = getStore();
    var level = 'core';

    if (!store || typeof store.getSubjectLevel !== 'function') {
      return level;
    }

    try {
      level = store.getSubjectLevel({ code: code }, 'core');
    } catch (error) {}

    return level === 'extended' ? 'extended' : 'core';
  }

  function setSubjectLevel(code, level) {
    var store = getStore();

    if (!store || typeof store.setSubjectLevel !== 'function') {
      return;
    }

    try {
      store.setSubjectLevel({ code: code }, level);
    } catch (error) {}
  }

  function getButtonText(button) {
    return String(button && button.textContent ? button.textContent : '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectGroupPillActive(button) {
    var rawStyle = button.getAttribute('style') || '';

    return rawStyle.indexOf('#1E1E1E') !== -1 ||
      rawStyle.indexOf('rgb(30, 30, 30)') !== -1 ||
      rawStyle.indexOf('#2A2A2A') !== -1 ||
      rawStyle.indexOf('rgb(42, 42, 42)') !== -1;
  }

  function findSubjectCode(button) {
    var existing = button.getAttribute('data-igcsefy-subject-code');
    var codeNode;
    var spans;
    var i;
    var text;

    if (existing) {
      return existing;
    }

    codeNode = button.querySelector('[data-igcsefy-subject-card-code]');
    if (!codeNode) {
      codeNode = button.querySelector('[data-igcsefy-basic-subject-code]');
    }
    if (codeNode) {
      text = (codeNode.textContent || '').trim();
      if (/^\d{4}$/.test(text)) {
        return text;
      }
    }

    spans = button.querySelectorAll('span');
    for (i = 0; i < spans.length; i += 1) {
      text = (spans[i].textContent || '').trim();
      if (/^\d{4}$/.test(text)) {
        return text;
      }
    }

    return '';
  }

  function findSubjectName(button) {
    var existing = button.getAttribute('data-igcsefy-subject-name');
    var nameNode;
    var spans;
    var i;
    var text;

    if (existing) {
      return existing;
    }

    nameNode = button.querySelector('[data-igcsefy-subject-card-name]');
    if (!nameNode) {
      nameNode = button.querySelector('[data-igcsefy-basic-subject-name]');
    }
    if (nameNode) {
      return (nameNode.textContent || '').trim();
    }

    spans = button.querySelectorAll('span');
    for (i = 0; i < spans.length; i += 1) {
      text = (spans[i].textContent || '').trim();
      if (!text || /^\d{4}$/.test(text) || text === 'Core' || text === 'Extended') {
        continue;
      }
      return text;
    }

    return '';
  }

  function detectSelected(button) {
    var children = button.children;
    var check = null;
    var rawStyle;
    var i;

    for (i = 0; i < children.length; i += 1) {
      var className = typeof children[i].className === 'string' ? children[i].className : '';
      if (className.indexOf('w-4') !== -1 && className.indexOf('h-4') !== -1 && className.indexOf('rounded-sm') !== -1) {
        check = children[i];
        break;
      }
    }

    if (check) {
      return !!check.querySelector('svg');
    }

    check = button.querySelector('[data-igcsefy-subject-card-check]');
    if (check) {
      return check.getAttribute('data-selected') === 'true';
    }

    check = button.querySelector('[data-igcsefy-basic-subject-check]');
    if (check) {
      return check.getAttribute('data-selected') === 'true';
    }

    rawStyle = button.getAttribute('style') || '';
    return rawStyle.indexOf('#161616') !== -1 || rawStyle.indexOf('rgb(22, 22, 22)') !== -1;
  }

  function isSelectorButton(button) {
    var className = typeof button.className === 'string' ? button.className : '';

    if (button.getAttribute('data-igcsefy-profile-subject-card') === 'true') {
      return true;
    }

    if (className.indexOf('w-full') === -1 || className.indexOf('text-left') === -1) {
      return false;
    }

    return /^\d{4}$/.test(findSubjectCode(button));
  }

  function buildMarkup(name, code, selected, tiered, activeLevel) {
    var checkedIcon = selected
      ? '<svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true"><path d="M1 4L3.8 6.8L9 1.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
      : '';

    return [
      '<span data-igcsefy-subject-card-check data-selected="', selected ? 'true' : 'false', '" aria-hidden="true">', checkedIcon, '</span>',
      '<span data-igcsefy-subject-card-body>',
      '<span data-igcsefy-subject-card-heading>',
      '<span data-igcsefy-subject-card-name>', escapeHtml(name), '</span>',
      '<span data-igcsefy-subject-card-code>', escapeHtml(code), '</span>',
      '</span>',
      '<span data-igcsefy-subject-card-levels aria-hidden="', tiered ? 'false' : 'true', '">',
      '<span data-igcsefy-subject-level="core" data-active="', selected && activeLevel === 'core' ? 'true' : 'false', '">Core</span>',
      '<span data-igcsefy-subject-level="extended" data-active="', selected && activeLevel === 'extended' ? 'true' : 'false', '">Extended</span>',
      '</span>',
      '</span>'
    ].join('');
  }

  function buildBasicMarkup(name, code, selected) {
    var checkedIcon = selected
      ? '<svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true"><path d="M1 4L3.8 6.8L9 1.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
      : '';

    return [
      '<span data-igcsefy-basic-subject-check data-selected="', selected ? 'true' : 'false', '" aria-hidden="true">', checkedIcon, '</span>',
      '<span data-igcsefy-basic-subject-body>',
      '<span data-igcsefy-basic-subject-name>', escapeHtml(name), '</span>',
      '</span>',
      '<span data-igcsefy-basic-subject-code>', escapeHtml(code), '</span>'
    ].join('');
  }

  function bindLevelControls(button, code, selected, tiered) {
    var levels;
    var i;

    if (!selected || !tiered) {
      return;
    }

    levels = button.querySelectorAll('[data-igcsefy-subject-level]');
    for (i = 0; i < levels.length; i += 1) {
      levels[i].addEventListener('click', function (event) {
        var level = event.currentTarget.getAttribute('data-igcsefy-subject-level');

        event.preventDefault();
        event.stopPropagation();

        if (level !== 'core' && level !== 'extended') {
          return;
        }

        setSubjectLevel(code, level);
        renderButton(button);
        scheduleApply();
      });
    }
  }

  function tagSubjectManager(root) {
    var buttons = root.querySelectorAll('button');
    var panels = root.querySelectorAll('.rounded-xl.overflow-hidden');
    var emptyHints = root.querySelectorAll('p');
    var i;

    for (i = 0; i < buttons.length; i += 1) {
      var button = buttons[i];
      var text = getButtonText(button);

      if (text === 'Manage subjects' || text === 'Done') {
        button.setAttribute('data-igcsefy-subject-manager-toggle', 'true');
        button.setAttribute('data-open', text === 'Done' ? 'true' : 'false');
      }

      if (SUBJECT_GROUP_LABELS[text]) {
        button.setAttribute('data-igcsefy-subject-group-pill', 'true');
        button.setAttribute('data-active', detectGroupPillActive(button) ? 'true' : 'false');
      }

      if (text === 'Confirm') {
        button.setAttribute('data-igcsefy-subject-manager-confirm', 'true');
        if (button.parentElement) {
          button.parentElement.setAttribute('data-igcsefy-subject-manager-footer', 'true');
        }
      }

      if (text === 'Add your first subject →') {
        button.setAttribute('data-igcsefy-subject-empty-action', 'true');
      }
    }

    for (i = 0; i < panels.length; i += 1) {
      var panel = panels[i];
      var searchInput = panel.querySelector('input[placeholder="Search subjects…"]');
      var searchShell;
      var searchIcon;
      var summary;

      if (!searchInput) {
        continue;
      }

      panel.setAttribute('data-igcsefy-subject-manager', 'true');
      if (panel.firstElementChild) {
        panel.firstElementChild.setAttribute('data-igcsefy-subject-manager-header', 'true');
      }

      searchShell = searchInput.parentElement;
      if (searchShell) {
        searchShell.setAttribute('data-igcsefy-subject-manager-search', 'true');
        searchIcon = searchShell.querySelector('svg');
        if (searchIcon) {
          searchIcon.setAttribute('data-igcsefy-subject-manager-search-icon', 'true');
        }
      }

      searchInput.setAttribute('data-igcsefy-subject-manager-search-input', 'true');

      summary = panel.querySelector('p');
      if (summary && getButtonText(panel.querySelector('[data-igcsefy-subject-manager-confirm="true"]')) === 'Confirm') {
        var footer = panel.querySelector('[data-igcsefy-subject-manager-footer="true"]');
        if (footer) {
          var summaryCopy = footer.querySelector('p');
          if (summaryCopy) {
            summaryCopy.setAttribute('data-igcsefy-subject-manager-summary', 'true');
          }
        }
      }
    }

    for (i = 0; i < emptyHints.length; i += 1) {
      var paragraph = emptyHints[i];
      var content = getButtonText(paragraph);
      if (content === 'No subjects tracked yet.' || content === 'No subjects match.') {
        paragraph.setAttribute('data-igcsefy-subject-empty-hint', 'true');
      }
    }
  }

  function renderButton(button) {
    var code = findSubjectCode(button);
    var name = findSubjectName(button);
    var selected = detectSelected(button);
    var tiered = !!TIERED_SUBJECT_CODES[code];
    var activeLevel = tiered ? getSubjectLevel(code) : '';
    var theme = isLightTheme() ? 'light' : 'dark';
    var signature;

    if (!code || !name) {
      return;
    }

    signature = [theme, code, name, selected ? '1' : '0', tiered ? '1' : '0', activeLevel].join('|');
    if (button.getAttribute('data-igcsefy-subject-signature') === signature &&
        button.querySelector('[data-igcsefy-subject-card-body]')) {
      return;
    }

    button.setAttribute('data-igcsefy-profile-subject-card', 'true');
    button.setAttribute('data-igcsefy-subject-signature', signature);
    button.setAttribute('data-igcsefy-subject-code', code);
    button.setAttribute('data-igcsefy-subject-name', name);
    button.setAttribute('data-selected', selected ? 'true' : 'false');
    button.setAttribute('data-tiered', tiered ? 'true' : 'false');
    button.setAttribute('data-theme', theme);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.innerHTML = buildMarkup(name, code, selected, tiered, activeLevel);
    bindLevelControls(button, code, selected, tiered);
  }

  function renderBasicButton(button) {
    var code = findSubjectCode(button);
    var name = findSubjectName(button);
    var selected = detectSelected(button);
    var theme = isLightTheme() ? 'light' : 'dark';
    var signature;

    if (!code || !name) {
      return;
    }

    signature = ['basic', theme, code, name, selected ? '1' : '0'].join('|');
    if (button.getAttribute('data-igcsefy-subject-signature') === signature &&
        button.querySelector('[data-igcsefy-basic-subject-body]')) {
      return;
    }

    button.removeAttribute('data-igcsefy-profile-subject-card');
    button.removeAttribute('data-tiered');
    button.setAttribute('data-igcsefy-basic-subject-option', 'true');
    button.setAttribute('data-igcsefy-subject-signature', signature);
    button.setAttribute('data-igcsefy-subject-code', code);
    button.setAttribute('data-igcsefy-subject-name', name);
    button.setAttribute('data-selected', selected ? 'true' : 'false');
    button.setAttribute('data-theme', theme);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.innerHTML = buildBasicMarkup(name, code, selected);
  }

  function findSelectorButtonByCode(code) {
    var root = document.getElementById('root');
    var buttons;
    var i;

    if (!root || !code) {
      return null;
    }

    buttons = root.querySelectorAll('button');
    for (i = 0; i < buttons.length; i += 1) {
      if (!isSelectorButton(buttons[i])) {
        continue;
      }
      if (findSubjectCode(buttons[i]) === code) {
        return buttons[i];
      }
    }

    return null;
  }

  function applyPatch() {
    var root;
    var buttons;
    var i;

    scheduled = false;
    ensureStyles();
    applyTrackedSubjectFilters();

    root = document.getElementById('root');
    if (!root) {
      return;
    }

    if (observer) {
      observer.disconnect();
    }

    tagSubjectManager(root);

    buttons = root.querySelectorAll('button');
    for (i = 0; i < buttons.length; i += 1) {
      var code;

      if (!isSelectorButton(buttons[i])) {
        continue;
      }
      code = findSubjectCode(buttons[i]);
      if (TIERED_SUBJECT_CODES[code]) {
        renderButton(buttons[i]);
      } else {
        renderBasicButton(buttons[i]);
      }
    }

    startObserver();
  }

  function scheduleApply() {
    if (scheduled) {
      return;
    }

    scheduled = true;
    requestAnimationFrame(applyPatch);
  }

  function startObserver() {
    var root = document.getElementById('root');

    if (!root) {
      return;
    }

    if (!observer) {
      observer = new MutationObserver(function () {
        scheduleApply();
      });
    }

    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  function bindInteractiveRefresh() {
    if (clickRefreshBound) {
      return;
    }

    clickRefreshBound = true;
    document.addEventListener('click', function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest('#root button') : null;
      var code = button && isSelectorButton(button) ? findSubjectCode(button) : '';

      if (!button) {
        return;
      }

      window.setTimeout(function () {
        var liveButton;

        if (code) {
          liveButton = findSelectorButtonByCode(code);
          if (liveButton) {
            persistTrackedSelection(code, detectSelected(liveButton));
          }
        }

        scheduleApply();
      }, 0);
    });
  }

  window.addEventListener('load', scheduleApply);
  window.addEventListener('igcsefy:data-change', scheduleApply);
  window.addEventListener('igcsefy:tracker-change', scheduleApply);
  window.addEventListener('igcsefy:theme-change', scheduleApply);
  document.addEventListener('DOMContentLoaded', function () {
    bindInteractiveRefresh();
    scheduleApply();
    startObserver();
  });

  if (document.readyState !== 'loading') {
    bindInteractiveRefresh();
    scheduleApply();
    startObserver();
  }
})();
