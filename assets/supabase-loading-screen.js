// IGCSEfy Supabase Loading Screen
// Shows a minimal circle spinner on auth-aware pages while Supabase auth resolves.
// Dismisses once auth and page-specific readiness checks complete, with safety fallbacks.
// Runs synchronously (no defer) so the overlay is in the DOM before React renders.
(function () {
  'use strict';

  var AUTH_EVENT = 'igcsefy:supabase-auth-change';
  var DATA_EVENT = 'igcsefy:data-change';
  var PAST_PAPERS_READY_EVENT = 'igcsefy:past-papers-ready';
  var PROFILE_READY_EVENT = 'igcsefy:profile-ready';
  var PROFILE_THEME_READY_EVENT = 'igcsefy:profile-theme-ready';
  var SITE_NAV_READY_EVENT = 'igcsefy:site-nav-ready';
  var OVERLAY_ID = 'igcsefy-loading-overlay';

  function isLightTheme() {
    var root = document.documentElement;
    return root.classList.contains('light') || root.dataset.theme === 'light';
  }

  function getNormalizedPath() {
    return String(window.location.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  }

  function isPastPapersPath(path) {
    return path === '/past-papers' || path.indexOf('/past-papers/') === 0;
  }

  function isProfilePath(path) {
    return path === '/profile' || path.indexOf('/profile/') === 0;
  }

  function shouldShowOverlay() {
    var path = getNormalizedPath();

    if (path.indexOf('/profile') === 0 || path.indexOf('/dashboard') === 0) {
      return true;
    }

    if (path === '/settings') {
      return true;
    }

    if (path === '/past-papers' || path.indexOf('/past-papers/') === 0) {
      return true;
    }

    if (/^\/subjects\/[^/]+$/.test(path)) {
      return true;
    }

    if (/^\/resources\/[^/]+$/.test(path)) {
      return true;
    }

    return false;
  }

  if (!shouldShowOverlay()) return;

  var lightTheme = isLightTheme();
  var style = document.createElement('style');
  style.textContent = [
    '#' + OVERLAY_ID + '{',
    '  position:fixed;inset:0;z-index:9999;',
    '  background:' + (lightTheme ? '#F1EFE7' : '#0A0A0B') + ';',
    '  display:flex;align-items:center;justify-content:center;',
    '  transition:opacity 400ms ease,visibility 400ms ease;',
    '  opacity:1;visibility:visible;',
    '}',
    '#' + OVERLAY_ID + '.is-fading{opacity:0;visibility:hidden;}',
    '#' + OVERLAY_ID + ' .ig-spinner{',
    '  width:28px;height:28px;',
    '  border-radius:50%;',
    '  border:2px solid ' + (lightTheme ? '#E9E3D8' : 'rgba(255,255,255,0.08)') + ';',
    '  border-top-color:' + (lightTheme ? '#000000' : 'rgba(236,234,221,0.5)') + ';',
    '  animation:igSpin 0.75s linear infinite;',
    '}',
    '@keyframes igSpin{to{transform:rotate(360deg);}}'
  ].join('');
  document.head.appendChild(style);

  function injectOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="ig-spinner"></div>';
    document.body.insertBefore(overlay, document.body.firstChild);
  }

  if (document.body) {
    injectOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', injectOverlay);
  }

  var dismissed = false;
  var minShowMs = 300;
  var shownAt = Date.now();
  var path = getNormalizedPath();
  var isPastPapersPage = isPastPapersPath(path);
  var isProfilePage = isProfilePath(path);
  var waitForProfileThemePaint = isProfilePage && lightTheme;
  var authResolved = false;
  var remoteReady = false;
  var pageReady = !isPastPapersPage && !isProfilePage;
  var themeReady = !waitForProfileThemePaint;
  var navReady = !!window.__igcsefySiteNavReady;
  var waitingForRemoteData = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    var elapsed = Date.now() - shownAt;
    var remaining = Math.max(0, minShowMs - elapsed);
    setTimeout(function () {
      var overlay = document.getElementById(OVERLAY_ID);
      if (!overlay) return;
      overlay.classList.add('is-fading');
      setTimeout(function () {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (style && style.parentNode) style.parentNode.removeChild(style);
      }, 420);
    }, remaining);
  }

  function maybeDismiss() {
    if (!authResolved) return;
    if (!remoteReady) return;
    if (!pageReady) return;
    if (!themeReady) return;
    if (!navReady) return;
    dismiss();
  }

  function waitForRemoteData() {
    if (waitingForRemoteData) return;
    waitingForRemoteData = true;

    var dataLoaded = false;
    var dataTimeout = 0;

    function finishWaiting() {
      if (dataLoaded) return;
      dataLoaded = true;
      window.clearTimeout(dataTimeout);
      window.removeEventListener(DATA_EVENT, onDataChange);
      remoteReady = true;
      maybeDismiss();
    }

    function onDataChange(de) {
      if (de.detail && (de.detail.reason === 'remote-load' || de.detail.reason === 'remote-update')) {
        finishWaiting();
      }
    }

    window.addEventListener(DATA_EVENT, onDataChange);
    dataTimeout = window.setTimeout(finishWaiting, isPastPapersPage ? 4500 : 3000);
  }

  if (isPastPapersPage) {
    window.addEventListener(PAST_PAPERS_READY_EVENT, function () {
      pageReady = true;
      maybeDismiss();
    });
  }

  if (isProfilePage) {
    window.addEventListener(PROFILE_READY_EVENT, function () {
      pageReady = true;
      maybeDismiss();
    });

    if (waitForProfileThemePaint) {
      window.addEventListener(PROFILE_THEME_READY_EVENT, function () {
        themeReady = true;
        maybeDismiss();
      });
    }
  }

  window.addEventListener(AUTH_EVENT, function (e) {
    authResolved = true;

    if (e.detail && e.detail.isAuthenticated) {
      remoteReady = false;
      waitForRemoteData();
    } else {
      remoteReady = true;
    }

    maybeDismiss();
  });

  window.addEventListener(SITE_NAV_READY_EVENT, function () {
    navReady = true;
    maybeDismiss();
  });

  // Final safety net
  window.addEventListener('load', function () {
    setTimeout(dismiss, isPastPapersPage ? 8000 : 5000);
  });

})();
