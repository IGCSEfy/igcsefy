(function () {
  'use strict';

  if (document.body == null || document.body.getAttribute('data-profile-page') !== 'true') {
    return;
  }

  var observer = null;
  var scheduled = false;
  var ORIGINAL_STYLE_ATTR = 'data-igcsefy-profile-light-orig-style';
  var LEGACY_TAB_STATE_ATTR = 'data-igcsefy-profile-tab-state';

  var COLORS = {
    page: '#F1EFE7',
    hero: '#F1EFE7',
    surface: '#FFFDF8',
    surfaceSoft: '#FBF7EF',
    dividerSoft: '#E6DECF',
    dividerStrong: '#CDBDA7',
    track: '#E7DED0',
    fill: '#CBB99F',
    activityReviewed: '#8E7A63',
    activityDone: '#CDBDA7',
    activityProgress: '#DDD2C1',
    textStrong: '#1F1A14',
    textMuted: '#746A5E'
  };

  function isLightTheme() {
    var root = document.documentElement;
    return root.classList.contains('light') || root.dataset.theme === 'light';
  }

  function setStyle(el, styles) {
    if (!el) return;
    if (!el.hasAttribute(ORIGINAL_STYLE_ATTR)) {
      el.setAttribute(ORIGINAL_STYLE_ATTR, el.getAttribute('style') || '');
    }
    Object.keys(styles).forEach(function (key) {
      el.style[key] = styles[key];
    });
  }

  function restoreOriginalStyles() {
    Array.prototype.forEach.call(document.querySelectorAll('[' + ORIGINAL_STYLE_ATTR + ']'), function (el) {
      var original = el.getAttribute(ORIGINAL_STYLE_ATTR);
      if (original) {
        el.setAttribute('style', original);
      } else {
        el.removeAttribute('style');
      }
      el.removeAttribute(ORIGINAL_STYLE_ATTR);
      if (el.classList.contains('items-center')) {
        el.onmouseenter = null;
        el.onmouseleave = null;
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[' + LEGACY_TAB_STATE_ATTR + ']'), function (el) {
      el.removeAttribute(LEGACY_TAB_STATE_ATTR);
    });
  }

  function softenNav() {
    var navBar = document.querySelector('.site-nav__bar');
    setStyle(navBar, {
      background: COLORS.page,
      borderBottomColor: COLORS.dividerSoft,
      boxShadow: 'none',
      backdropFilter: 'none',
      webkitBackdropFilter: 'none'
    });
  }

  function softenHeader(root) {
    var screen = root.querySelector('.min-h-screen');
    if (!screen) return;

    setStyle(screen, { background: COLORS.page });

    var hero = screen.firstElementChild;
    setStyle(hero, {
      background: COLORS.hero,
      borderBottom: '1px solid ' + COLORS.dividerSoft
    });

    var tabs = hero ? hero.querySelector('.flex.gap-0.-mb-px') : null;
    if (!tabs) return;

    setStyle(tabs, { borderBottom: 'none' });
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (button) {
      button.removeAttribute(LEGACY_TAB_STATE_ATTR);
    });
  }

  function softenOverview(root) {
    var card = root.querySelector('.rounded-xl.grid.grid-cols-2');
    if (!card) return;

    setStyle(card, {
      background: COLORS.surface,
      border: '1px solid ' + COLORS.dividerSoft
    });

    Array.prototype.forEach.call(card.children, function (child) {
      setStyle(child, { borderColor: COLORS.dividerSoft });
    });
  }

  function softenProgressTables(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.rounded-xl.overflow-hidden'), function (table) {
      if (table.querySelector('input[placeholder="Search subjects…"]')) {
        return;
      }

      setStyle(table, {
        background: COLORS.surface,
        borderColor: COLORS.dividerSoft
      });

      var rows = table.querySelectorAll(':scope > .grid');
      Array.prototype.forEach.call(rows, function (row, index) {
        var isHeader = row.classList.contains('py-3');
        if (isHeader) {
          setStyle(row, {
            background: COLORS.surfaceSoft,
            borderBottomColor: COLORS.dividerSoft
          });
          return;
        }

        setStyle(row, {
          background: COLORS.surface,
          borderBottomColor: index < rows.length - 1 ? COLORS.dividerSoft : 'transparent'
        });

        row.onmouseenter = function () {
          row.style.background = COLORS.surfaceSoft;
        };
        row.onmouseleave = function () {
          row.style.background = COLORS.surface;
        };
      });
    });
  }

  function softenTracks(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.relative.w-full.h-\\[2px\\].rounded-full'), function (track) {
      setStyle(track, { background: COLORS.track });
      var fill = track.firstElementChild;
      if (fill) {
        setStyle(fill, { background: COLORS.fill });
      }
    });
  }

  function softenActivityBars(root) {
    Array.prototype.forEach.call(root.querySelectorAll('div'), function (bar) {
      var className = typeof bar.className === 'string' ? bar.className : '';
      if (className.indexOf('h-[3px]') === -1 ||
          className.indexOf('rounded-full') === -1 ||
          className.indexOf('overflow-hidden') === -1 ||
          className.indexOf('gap-[1px]') === -1) {
        return;
      }

      Array.prototype.forEach.call(bar.children, function (segment) {
        var rawStyle = segment.getAttribute('style') || '';
        if (rawStyle.indexOf('#ECEADD') !== -1 || rawStyle.indexOf('rgb(236, 234, 221)') !== -1) {
          setStyle(segment, { background: COLORS.activityReviewed });
        } else if (rawStyle.indexOf('#3A3A3A') !== -1 || rawStyle.indexOf('rgb(58, 58, 58)') !== -1) {
          setStyle(segment, { background: COLORS.activityDone });
        } else if (rawStyle.indexOf('#252525') !== -1 || rawStyle.indexOf('rgb(37, 37, 37)') !== -1) {
          setStyle(segment, { background: COLORS.activityProgress });
        }
      });
    });
  }

  function applyLightThemePatch() {
    scheduled = false;

    var root = document.getElementById('root');
    if (!root) return;

    if (!isLightTheme()) {
      restoreOriginalStyles();
      return;
    }

    setStyle(document.body, { background: COLORS.page });
    softenNav();
    softenHeader(root);
    softenOverview(root);
    softenProgressTables(root);
    softenTracks(root);
    softenActivityBars(root);
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyLightThemePatch);
  }

  function startObserver() {
    var root = document.getElementById('root');
    if (!root || observer) return;

    observer = new MutationObserver(scheduleApply);
    observer.observe(root, { childList: true, subtree: true });
  }

  window.addEventListener('igcsefy:theme-change', scheduleApply);
  window.addEventListener('load', scheduleApply);
  document.addEventListener('DOMContentLoaded', function () {
    scheduleApply();
    startObserver();
  });

  if (document.readyState !== 'loading') {
    scheduleApply();
    startObserver();
  }
})();
