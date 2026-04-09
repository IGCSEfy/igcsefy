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
  var SUBJECT_NAME_BY_CODE = {
    '0266': 'Psychology',
    '0450': 'Business Studies',
    '0452': 'Accounting',
    '0455': 'Economics',
    '0478': 'Computer Science',
    '0495': 'Sociology',
    '0500': 'English Language',
    '0510': 'English as a Second Language',
    '0580': 'Mathematics',
    '0610': 'Biology',
    '0620': 'Chemistry',
    '0625': 'Physics'
  };
  var TRACKING_FILTER_PATCH_FLAG = '__igcsefyProfileTrackingFilterPatched';
  var PROFILE_PATCH_READY_EVENT = 'igcsefy:profile-patch-ready';
  var PROFILE_PATCH_STATE_KEY = '__igcsefyProfilePatchReady';

  function markProfilePatchReady(step) {
    var state = window[PROFILE_PATCH_STATE_KEY];

    if (!state || typeof state !== 'object') {
      state = {};
      window[PROFILE_PATCH_STATE_KEY] = state;
    }

    if (!step || state[step]) {
      return;
    }

    state[step] = true;

    try {
      window.dispatchEvent(new CustomEvent(PROFILE_PATCH_READY_EVENT, {
        detail: { step: step }
      }));
    } catch (error) {}
  }

  function ensureStyles() {
    var style;

    if (document.getElementById(STYLE_ID)) {
      return;
    }

    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'html.light body[data-profile-page="true"],',
      'html[data-theme="light"] body[data-profile-page="true"] {',
      '  --igcsefy-subject-selector-page: #F1EFE7;',
      '  --igcsefy-subject-selector-surface: var(--igcsefy-profile-surface, #FFFDF8);',
      '  --igcsefy-subject-selector-surface-soft: var(--igcsefy-profile-surface-soft, #FBF7EF);',
      '  --igcsefy-subject-selector-border: var(--igcsefy-profile-divider-soft, #E6DECF);',
      '  --igcsefy-subject-selector-border-strong: var(--igcsefy-profile-divider-strong, #CDBDA7);',
      '  --igcsefy-subject-selector-line-strong: var(--igcsefy-profile-line-strong, #B9A68E);',
      '  --igcsefy-subject-selector-accent: var(--igcsefy-profile-accent-fill, #8E7A63);',
      '  --igcsefy-subject-selector-text: #1F1A14;',
      '  --igcsefy-subject-selector-muted: #666666;',
      '  --igcsefy-subject-selector-muted-strong: #746A5E;',
      '  --igcsefy-subject-selector-shadow-sm: 0 1px 2px rgba(112, 96, 77, 0.08);',
      '  --igcsefy-subject-selector-shadow-md: 0 10px 24px rgba(112, 96, 77, 0.10);',
      '}',
      '[data-igcsefy-tracked-count="true"] {',
      '  display: block !important;',
      '  width: auto !important;',
      '  margin-left: 0 !important;',
      '  padding-left: 0 !important;',
      '  text-align: left !important;',
      '  white-space: nowrap;',
      '  font-variant-numeric: tabular-nums;',
      '  font-feature-settings: "tnum";',
      '}',
      'button[data-igcsefy-profile-subject-card="true"] {',
      '  position: relative;',
      '  display: flex !important;',
      '  align-items: flex-start !important;',
      '  gap: 12px !important;',
      '  width: 100% !important;',
      '  min-height: 88px !important;',
      '  padding: 12px 16px !important;',
      '  border-radius: 16px !important;',
      '  text-align: left !important;',
      '  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease !important;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  border: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: none !important;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"][data-selected="true"] {',
      '  border-color: var(--igcsefy-subject-selector-border-strong) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"]:hover {',
      '  border-color: var(--igcsefy-subject-selector-border-strong) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-md) !important;',
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
      '  width: 16px;',
      '  height: 16px;',
      '  margin-top: 0;',
      '  border-radius: 4px;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  flex-shrink: 0;',
      '  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] [data-igcsefy-subject-card-check] {',
      '  background: transparent;',
      '  border: 1px solid var(--igcsefy-subject-selector-border-strong);',
      '  color: var(--igcsefy-subject-selector-text);',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"][data-selected="true"] [data-igcsefy-subject-card-check] {',
      '  background: var(--igcsefy-subject-selector-accent);',
      '  border-color: var(--igcsefy-subject-selector-accent);',
      '  color: var(--igcsefy-subject-selector-surface);',
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
      '  gap: 8px;',
      '}',
      '[data-igcsefy-subject-card-heading] {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  gap: 12px;',
      '}',
      '[data-igcsefy-subject-card-name] {',
      '  display: block;',
      '  min-width: 0;',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  letter-spacing: 0;',
      '  line-height: 1.2;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] [data-igcsefy-subject-card-name] {',
      '  color: var(--igcsefy-subject-selector-text);',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"] [data-igcsefy-subject-card-name] {',
      '  color: #ECEADD;',
      '}',
      '[data-igcsefy-subject-card-code] {',
      '  flex-shrink: 0;',
      '  font-size: 10px;',
      '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] [data-igcsefy-subject-card-code] {',
      '  color: var(--igcsefy-subject-selector-muted-strong);',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"] [data-igcsefy-subject-card-code] {',
      '  color: #555555;',
      '}',
      '[data-igcsefy-subject-card-levels] {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 4px;',
      '  width: min(100%, 280px);',
      '  max-width: 280px;',
      '  padding: 3px;',
      '  border-radius: 999px;',
      '  transition: opacity 0.18s ease, filter 0.18s ease;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] [data-igcsefy-subject-card-levels] {',
      '  background: var(--igcsefy-subject-selector-page);',
      '  border: 1px solid var(--igcsefy-subject-selector-border);',
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
      '  min-width: 0;',
      '  flex: 1 1 0;',
      '  border: 0;',
      '  border-radius: 999px;',
      '  padding: 8px 12px;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  font-size: 10px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.16em;',
      '  text-transform: uppercase;',
      '  line-height: 1;',
      '  user-select: none;',
      '  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-selected="false"] [data-igcsefy-subject-level] {',
      '  pointer-events: none;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"] [data-igcsefy-subject-level] {',
      '  color: var(--igcsefy-subject-selector-muted);',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="dark"] [data-igcsefy-subject-level] {',
      '  color: #4A4A4A;',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"][data-selected="true"] [data-igcsefy-subject-level][data-active="true"] {',
      '  background: var(--igcsefy-subject-selector-surface);',
      '  color: var(--igcsefy-subject-selector-text);',
      '  box-shadow: 0 0 0 1px var(--igcsefy-subject-selector-border), var(--igcsefy-subject-selector-shadow-sm);',
      '}',
      'button[data-igcsefy-profile-subject-card="true"][data-theme="light"][data-selected="true"] [data-igcsefy-subject-level][data-active="false"] {',
      '  color: var(--igcsefy-subject-selector-muted);',
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
      '    min-height: 84px !important;',
      '    padding: 11px 14px !important;',
      '    gap: 10px !important;',
      '  }',
      '  [data-igcsefy-subject-level] {',
      '    padding: 7px 10px;',
      '    letter-spacing: 0.13em;',
      '  }',
      '  [data-igcsefy-subject-card-levels] {',
      '    width: min(100%, 250px);',
      '    max-width: 250px;',
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
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  border: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: none !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"][data-selected="true"] {',
      '  border-color: var(--igcsefy-subject-selector-border-strong) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"]:hover {',
      '  border-color: var(--igcsefy-subject-selector-border-strong) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-md) !important;',
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
      '  border: 1px solid var(--igcsefy-subject-selector-border-strong) !important;',
      '  color: var(--igcsefy-subject-selector-text) !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"][data-selected="true"] [data-igcsefy-basic-subject-check] {',
      '  background: var(--igcsefy-subject-selector-accent) !important;',
      '  border-color: var(--igcsefy-subject-selector-accent) !important;',
      '  color: var(--igcsefy-subject-selector-surface) !important;',
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
      '  color: var(--igcsefy-subject-selector-muted-strong) !important;',
      '}',
      'button[data-igcsefy-basic-subject-option="true"][data-theme="light"][data-selected="true"] [data-igcsefy-basic-subject-name] {',
      '  color: var(--igcsefy-subject-selector-text) !important;',
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
      '  color: var(--igcsefy-subject-selector-muted-strong) !important;',
      '}',
      'html.light #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150,',
      'html[data-theme="light"] #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150 {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  border: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: none !important;',
      '  outline: none !important;',
      '}',
      'html.light #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150:hover,',
      'html.light #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150:focus-visible,',
      'html[data-theme="light"] #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150:hover,',
      'html[data-theme="light"] #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150:focus-visible {',
      '  border-color: var(--igcsefy-subject-selector-border-strong) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-md) !important;',
      '  outline: none !important;',
      '}',
      'html.light #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150 > div.w-4.h-4.rounded-sm,',
      'html[data-theme="light"] #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150 > div.w-4.h-4.rounded-sm {',
      '  background: transparent !important;',
      '  border: 1px solid var(--igcsefy-subject-selector-border-strong) !important;',
      '  color: var(--igcsefy-subject-selector-text) !important;',
      '}',
      'html.light #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150[style*="#161616"],',
      'html.light #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150[style*="rgb(22, 22, 22)"],',
      'html[data-theme="light"] #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150[style*="#161616"],',
      'html[data-theme="light"] #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150[style*="rgb(22, 22, 22)"] {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  border-color: var(--igcsefy-subject-selector-border-strong) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '}',
      'html.light #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150[style*="#161616"] > div.w-4.h-4.rounded-sm,',
      'html.light #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150[style*="rgb(22, 22, 22)"] > div.w-4.h-4.rounded-sm,',
      'html[data-theme="light"] #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150[style*="#161616"] > div.w-4.h-4.rounded-sm,',
      'html[data-theme="light"] #root button.flex.items-center.gap-3.px-4.py-3.rounded-xl.w-full.text-left.transition-all.duration-150[style*="rgb(22, 22, 22)"] > div.w-4.h-4.rounded-sm {',
      '  background: var(--igcsefy-subject-selector-accent) !important;',
      '  border-color: var(--igcsefy-subject-selector-accent) !important;',
      '  color: var(--igcsefy-subject-selector-surface) !important;',
      '}',
      'html.light #root button.whitespace-nowrap.rounded-full,',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full {',
      '  background: var(--igcsefy-subject-selector-surface-soft) !important;',
      '  color: var(--igcsefy-subject-selector-muted-strong) !important;',
      '  border: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: none !important;',
      '}',
      'html.light #root button.whitespace-nowrap.rounded-full:hover,',
      'html.light #root button.whitespace-nowrap.rounded-full:focus-visible,',
      'html.light #root button.whitespace-nowrap.rounded-full:active,',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full:hover,',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full:focus-visible,',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full:active {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  color: var(--igcsefy-subject-selector-text) !important;',
      '  border-color: var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '}',
      'html.light #root button.whitespace-nowrap.rounded-full[style*="#1E1E1E"],',
      'html.light #root button.whitespace-nowrap.rounded-full[style*="rgb(30, 30, 30)"],',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full[style*="#1E1E1E"],',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full[style*="rgb(30, 30, 30)"] {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  color: var(--igcsefy-subject-selector-text) !important;',
      '  border-color: var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '}',
      'html.light #root button.whitespace-nowrap.rounded-full[style*="#1E1E1E"]:hover,',
      'html.light #root button.whitespace-nowrap.rounded-full[style*="rgb(30, 30, 30)"]:hover,',
      'html.light #root button.whitespace-nowrap.rounded-full[style*="#1E1E1E"]:focus-visible,',
      'html.light #root button.whitespace-nowrap.rounded-full[style*="rgb(30, 30, 30)"]:focus-visible,',
      'html.light #root button.whitespace-nowrap.rounded-full[style*="#1E1E1E"]:active,',
      'html.light #root button.whitespace-nowrap.rounded-full[style*="rgb(30, 30, 30)"]:active,',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full[style*="#1E1E1E"]:hover,',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full[style*="rgb(30, 30, 30)"]:hover,',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full[style*="#1E1E1E"]:focus-visible,',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full[style*="rgb(30, 30, 30)"]:focus-visible,',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full[style*="#1E1E1E"]:active,',
      'html[data-theme="light"] #root button.whitespace-nowrap.rounded-full[style*="rgb(30, 30, 30)"]:active {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  color: var(--igcsefy-subject-selector-text) !important;',
      '  border-color: var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '}',
      'html.light #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150,',
      'html[data-theme="light"] #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150 {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  color: var(--igcsefy-subject-selector-text) !important;',
      '  border: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: none !important;',
      '  outline: none !important;',
      '}',
      'html.light #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150:hover,',
      'html.light #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150:focus-visible,',
      'html[data-theme="light"] #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150:hover,',
      'html[data-theme="light"] #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150:focus-visible {',
      '  border-color: var(--igcsefy-subject-selector-border-strong) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '  outline: none !important;',
      '}',
      'html.light #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="#1A1A1A"],',
      'html.light #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="rgb(26, 26, 26)"],',
      'html[data-theme="light"] #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="#1A1A1A"],',
      'html[data-theme="light"] #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="rgb(26, 26, 26)"] {',
      '  background: var(--igcsefy-subject-selector-accent) !important;',
      '  color: var(--igcsefy-subject-selector-surface) !important;',
      '  border-color: transparent !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '}',
      'html.light #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="#1A1A1A"]:hover,',
      'html.light #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="rgb(26, 26, 26)"]:hover,',
      'html.light #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="#1A1A1A"]:focus-visible,',
      'html.light #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="rgb(26, 26, 26)"]:focus-visible,',
      'html[data-theme="light"] #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="#1A1A1A"]:hover,',
      'html[data-theme="light"] #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="rgb(26, 26, 26)"]:hover,',
      'html[data-theme="light"] #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="#1A1A1A"]:focus-visible,',
      'html[data-theme="light"] #root div.flex.items-end.justify-between > button.flex.items-center.gap-2.text-\\[13px\\].font-medium.px-4.py-2.rounded-full.transition-colors.duration-150[style*="rgb(26, 26, 26)"]:focus-visible {',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-md) !important;',
      '}',
      'html.light #root div.px-4.py-3.flex.items-center.justify-between > button.text-\\[12px\\].font-medium.px-4.py-1\\.5.rounded-full.transition-colors.duration-150,',
      'html[data-theme="light"] #root div.px-4.py-3.flex.items-center.justify-between > button.text-\\[12px\\].font-medium.px-4.py-1\\.5.rounded-full.transition-colors.duration-150 {',
      '  background: var(--igcsefy-subject-selector-accent) !important;',
      '  color: var(--igcsefy-subject-selector-surface) !important;',
      '  border: none !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '  outline: none !important;',
      '  opacity: 1 !important;',
      '}',
      'html.light #root div.px-4.py-3.flex.items-center.justify-between > button.text-\\[12px\\].font-medium.px-4.py-1\\.5.rounded-full.transition-colors.duration-150:hover,',
      'html.light #root div.px-4.py-3.flex.items-center.justify-between > button.text-\\[12px\\].font-medium.px-4.py-1\\.5.rounded-full.transition-colors.duration-150:focus-visible,',
      'html[data-theme="light"] #root div.px-4.py-3.flex.items-center.justify-between > button.text-\\[12px\\].font-medium.px-4.py-1\\.5.rounded-full.transition-colors.duration-150:hover,',
      'html[data-theme="light"] #root div.px-4.py-3.flex.items-center.justify-between > button.text-\\[12px\\].font-medium.px-4.py-1\\.5.rounded-full.transition-colors.duration-150:focus-visible {',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-md) !important;',
      '  outline: none !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-toggle="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-toggle="true"] {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  color: var(--igcsefy-subject-selector-text) !important;',
      '  border: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: none !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-toggle="true"][data-open="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-toggle="true"][data-open="true"] {',
      '  background: var(--igcsefy-subject-selector-accent) !important;',
      '  color: var(--igcsefy-subject-selector-surface) !important;',
      '  border-color: transparent !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-toggle="true"][data-open="true"]:hover,',
      'html.light [data-igcsefy-subject-manager-toggle="true"][data-open="true"]:focus-visible,',
      'html[data-theme="light"] [data-igcsefy-subject-manager-toggle="true"][data-open="true"]:hover,',
      'html[data-theme="light"] [data-igcsefy-subject-manager-toggle="true"][data-open="true"]:focus-visible {',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-md) !important;',
      '  outline: none !important;',
      '}',
      'html.light [data-igcsefy-subject-manager="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager="true"] {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  border: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-header="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-header="true"] {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  border-bottom: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-search="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-search="true"] {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  border-right: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-search-icon="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-search-icon="true"] {',
      '  color: var(--igcsefy-subject-selector-muted-strong) !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-search-input="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-search-input="true"] {',
      '  color: var(--igcsefy-subject-selector-text) !important;',
      '  caret-color: var(--igcsefy-subject-selector-text) !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-search-input="true"]::placeholder,',
      'html[data-theme="light"] [data-igcsefy-subject-manager-search-input="true"]::placeholder {',
      '  color: var(--igcsefy-subject-selector-muted-strong) !important;',
      '  opacity: 1 !important;',
      '}',
      'html.light [data-igcsefy-subject-group-pill="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-group-pill="true"] {',
      '  background: var(--igcsefy-subject-selector-surface-soft) !important;',
      '  color: var(--igcsefy-subject-selector-muted-strong) !important;',
      '  border: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: none !important;',
      '}',
      'html.light [data-igcsefy-subject-group-pill="true"][data-active="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-group-pill="true"][data-active="true"] {',
      '  background: var(--igcsefy-subject-selector-surface) !important;',
      '  color: var(--igcsefy-subject-selector-text) !important;',
      '  border-color: var(--igcsefy-subject-selector-border) !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '}',
      'html.light [data-igcsefy-subject-group-pill="true"]:hover,',
      'html.light [data-igcsefy-subject-group-pill="true"]:focus-visible,',
      'html[data-theme="light"] [data-igcsefy-subject-group-pill="true"]:hover,',
      'html[data-theme="light"] [data-igcsefy-subject-group-pill="true"]:focus-visible {',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-footer="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-footer="true"] {',
      '  border-top: 1px solid var(--igcsefy-subject-selector-border) !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-summary="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-summary="true"] {',
      '  color: var(--igcsefy-subject-selector-muted-strong) !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-summary="true"] span,',
      'html[data-theme="light"] [data-igcsefy-subject-manager-summary="true"] span {',
      '  color: var(--igcsefy-subject-selector-text) !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-confirm="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-manager-confirm="true"] {',
      '  background: var(--igcsefy-subject-selector-accent) !important;',
      '  color: var(--igcsefy-subject-selector-surface) !important;',
      '  border: none !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-sm) !important;',
      '  outline: none !important;',
      '  opacity: 1 !important;',
      '}',
      'html.light [data-igcsefy-subject-manager-confirm="true"]:hover,',
      'html.light [data-igcsefy-subject-manager-confirm="true"]:focus-visible,',
      'html[data-theme="light"] [data-igcsefy-subject-manager-confirm="true"]:hover,',
      'html[data-theme="light"] [data-igcsefy-subject-manager-confirm="true"]:focus-visible {',
      '  border: none !important;',
      '  box-shadow: var(--igcsefy-subject-selector-shadow-md) !important;',
      '  outline: none !important;',
      '}',
      'html.light [data-igcsefy-subject-empty-hint="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-empty-hint="true"] {',
      '  color: var(--igcsefy-subject-selector-muted-strong) !important;',
      '}',
      'html.light [data-igcsefy-subject-empty-action="true"],',
      'html[data-theme="light"] [data-igcsefy-subject-empty-action="true"] {',
      '  color: var(--igcsefy-subject-selector-text) !important;',
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

  function getRawStoreSnapshot() {
    var store = getStore();
    var getter = store && typeof store.__igcsefyProfileOriginalGetSnapshot === 'function'
      ? store.__igcsefyProfileOriginalGetSnapshot
      : store && typeof store.getSnapshot === 'function'
        ? store.getSnapshot.bind(store)
        : null;

    if (!getter) {
      return {};
    }

    try {
      return getter() || {};
    } catch (error) {
      return {};
    }
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
      var subject = {
        code: code,
        slug: SUBJECT_SLUG_BY_CODE[code] || '',
        name: SUBJECT_NAME_BY_CODE[code] || code
      };

      if (TIERED_SUBJECT_CODES[code]) {
        subject.hasDistinctLevels = true;
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

    if (!store || typeof store.setTrackedSubjects !== 'function') {
      return;
    }

    snapshot = getRawStoreSnapshot();
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

  function filterSyllabusStatesByTrackedSubjects(states, trackedCodes) {
    var allowedSlugs = new Set(
      (Array.isArray(trackedCodes) ? trackedCodes : [])
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

  function filterPastPaperStatusesByTrackedSubjects(statuses, trackedCodes) {
    var trackedCodesSet = new Set(Array.isArray(trackedCodes) ? trackedCodes : []);
    var filtered = {};

    Object.keys(statuses || {}).forEach(function (key) {
      var parts = String(key || '').split('|');
      var code = parts.length >= 2 ? String(parts[1] || '').trim() : '';
      if (trackedCodesSet.has(code)) {
        filtered[key] = statuses[key];
      }
    });

    return filtered;
  }

  function filterSnapshotByTrackedSubjects(snapshot) {
    var cloned = snapshot && typeof snapshot === 'object' ? snapshot : {};
    var trackedCodes = getTrackedCodes(cloned);

    return {
      trackedSubjects: Array.isArray(cloned.trackedSubjects) ? cloned.trackedSubjects.slice() : [],
      subjectPreferences: cloned.subjectPreferences && typeof cloned.subjectPreferences === 'object'
        ? Object.assign({}, cloned.subjectPreferences)
        : {},
      syllabusTopicStates: filterSyllabusStatesByTrackedSubjects(cloned.syllabusTopicStates || {}, trackedCodes),
      pastPaperStatuses: filterPastPaperStatusesByTrackedSubjects(cloned.pastPaperStatuses || {}, trackedCodes),
      updatedAt: cloned.updatedAt || null
    };
  }

  function applyTrackedSubjectFilters() {
    var store = getStore();
    var originalGetSnapshot;
    var originalGetSyllabusStates;
    var originalGetSyllabusState;
    var originalGetPastPaperStatuses;
    var originalGetPastPaperStatus;

    if (!store || store[TRACKING_FILTER_PATCH_FLAG]) {
      return;
    }

    originalGetSnapshot = typeof store.getSnapshot === 'function'
      ? store.getSnapshot.bind(store)
      : null;
    originalGetSyllabusStates = typeof store.getSyllabusStates === 'function'
      ? store.getSyllabusStates.bind(store)
      : null;
    originalGetSyllabusState = typeof store.getSyllabusState === 'function'
      ? store.getSyllabusState.bind(store)
      : null;
    originalGetPastPaperStatuses = typeof store.getPastPaperStatuses === 'function'
      ? store.getPastPaperStatuses.bind(store)
      : null;
    originalGetPastPaperStatus = typeof store.getPastPaperStatus === 'function'
      ? store.getPastPaperStatus.bind(store)
      : null;

    if (originalGetSnapshot) {
      store.__igcsefyProfileOriginalGetSnapshot = originalGetSnapshot;
    }

    if (originalGetSnapshot) {
      store.getSnapshot = function () {
        return filterSnapshotByTrackedSubjects(originalGetSnapshot());
      };
    }

    if (originalGetSyllabusStates) {
      store.getSyllabusStates = function () {
        var rawSnapshot = originalGetSnapshot ? (originalGetSnapshot() || {}) : {};
        return filterSyllabusStatesByTrackedSubjects(originalGetSyllabusStates(), getTrackedCodes(rawSnapshot));
      };
    }

    if (originalGetSyllabusState) {
      store.getSyllabusState = function (topicKey) {
        var rawSnapshot = originalGetSnapshot ? (originalGetSnapshot() || {}) : {};
        var filteredStates = filterSyllabusStatesByTrackedSubjects(
          originalGetSyllabusStates ? originalGetSyllabusStates() : {},
          getTrackedCodes(rawSnapshot)
        );
        return filteredStates[String(topicKey || '')] || 'not_started';
      };
    }

    if (originalGetPastPaperStatuses) {
      store.getPastPaperStatuses = function () {
        var rawSnapshot = originalGetSnapshot ? (originalGetSnapshot() || {}) : {};
        return filterPastPaperStatusesByTrackedSubjects(
          originalGetPastPaperStatuses(),
          getTrackedCodes(rawSnapshot)
        );
      };
    }

    if (originalGetPastPaperStatus) {
      store.getPastPaperStatus = function (trackKey) {
        var rawSnapshot = originalGetSnapshot ? (originalGetSnapshot() || {}) : {};
        var filteredStatuses = filterPastPaperStatusesByTrackedSubjects(
          originalGetPastPaperStatuses ? originalGetPastPaperStatuses() : {},
          getTrackedCodes(rawSnapshot)
        );
        return filteredStatuses[String(trackKey || '')] || 'none';
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

  function isTrackedSubjectRemoveButton(button) {
    return !!button && getButtonText(button) === 'Remove';
  }

  function findRemoveButtonSubjectCode(button) {
    var current = button && button.parentElement ? button.parentElement : null;
    var code = '';

    while (current && current.id !== 'root') {
      code = findSubjectCode(current);
      if (/^\d{4}$/.test(code)) {
        return code;
      }
      current = current.parentElement;
    }

    return '';
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

      if (text === 'Remove') {
        button.setAttribute('data-igcsefy-tracked-subject-remove', 'true');
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

  function tagTrackedCount(root) {
    var paragraphs = root.querySelectorAll('p');
    var i;

    for (i = 0; i < paragraphs.length; i += 1) {
      var paragraph = paragraphs[i];
      var content = getButtonText(paragraph);
      var match = content.match(/^\d+\s+tracked$/i);

      if (!match) {
        paragraph.removeAttribute('data-igcsefy-tracked-count');
        continue;
      }

      paragraph.setAttribute('data-igcsefy-tracked-count', 'true');
    }
  }

  function renderButton(button, forcedSelected) {
    var code = findSubjectCode(button);
    var name = findSubjectName(button);
    var selected = typeof forcedSelected === 'boolean' ? forcedSelected : detectSelected(button);
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

  function renderBasicButton(button, forcedSelected) {
    var code = findSubjectCode(button);
    var name = findSubjectName(button);
    var selected = typeof forcedSelected === 'boolean' ? forcedSelected : detectSelected(button);
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

  function renderSelectorButtonWithState(button, selected) {
    var code = findSubjectCode(button);

    if (TIERED_SUBJECT_CODES[code]) {
      renderButton(button, selected);
      return;
    }

    renderBasicButton(button, selected);
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
    tagTrackedCount(root);

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

    markProfilePatchReady('subject-filter');
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
      var nextSelected;

      if (!button) {
        return;
      }

      if (isTrackedSubjectRemoveButton(button)) {
        code = findRemoveButtonSubjectCode(button);
        if (code) {
          persistTrackedSelection(code, false);
        }
        window.setTimeout(scheduleApply, 0);
        return;
      }

      if (!code) {
        window.setTimeout(scheduleApply, 0);
        return;
      }

      if (target && target.closest && target.closest('[data-igcsefy-subject-level]')) {
        window.setTimeout(scheduleApply, 0);
        return;
      }

      nextSelected = !detectSelected(button);
      renderSelectorButtonWithState(button, nextSelected);
      persistTrackedSelection(code, nextSelected);

      window.setTimeout(function () {
        scheduleApply();
      }, 0);
    }, true);
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
