// IGCSEfy Welcome Back
// Keeps the home hero stable across auth boot so users never see the default
// headline flash in after sign-in. The home gate waits until this script says
// the hero is in its final state.
(function () {
  var AUTH_EVENT = 'igcsefy:supabase-auth-change';
  var READY_EVENT = 'igcsefy:home-hero-ready';

  function isHomePage() {
    var p = window.location.pathname.replace(/\/+$/, '') || '/';
    return p === '' || p === '/';
  }

  if (!isHomePage()) return;

  var currentUser = null;
  var authResolved = false;
  var isAuthenticated = false;
  var originalHeroHTML = '';
  var themeObserver = null;
  var heroObserver = null;
  var applyQueued = false;

  function ensureGreetingFallbackStyles() {
    if (document.getElementById('igcsefy-home-greeting-fallback-style')) return;

    var style = document.createElement('style');
    style.id = 'igcsefy-home-greeting-fallback-style';
    style.textContent =
      'html.dark #root section.relative.min-h-screen .relative.z-10 h1 > span:last-of-type,' +
      'html[data-theme="dark"] #root section.relative.min-h-screen .relative.z-10 h1 > span:last-of-type {' +
      'color: rgba(255, 255, 255, 0.5) !important;' +
      '}' +
      'html.light #root section.relative.min-h-screen .relative.z-10 h1 > span:last-of-type,' +
      'html[data-theme="light"] #root section.relative.min-h-screen .relative.z-10 h1 > span:last-of-type {' +
      'color: #CDBDA7 !important;' +
      '}' +
      'html.light #root section.relative.min-h-screen .relative.z-10 h1 [data-welcome-line="name"],' +
      'html[data-theme="light"] #root section.relative.min-h-screen .relative.z-10 h1 [data-welcome-line="name"] {' +
      'color: #CDBDA7 !important;' +
      '}';
    document.head.appendChild(style);
  }

  function isLightTheme() {
    var root = document.documentElement;
    return root.classList.contains('light') || root.dataset.theme === 'light';
  }

  function buildGreetingHTML(firstName) {
    return (
      '<span data-welcome-line="lead">Welcome back,</span><br>' +
      '<span data-welcome-line="name">' + firstName + '</span>'
    );
  }

  function setImportantColor(element, value) {
    if (!element) return;
    if (value) {
      element.style.setProperty('color', value, 'important');
    } else {
      element.style.removeProperty('color');
    }
  }

  function dispatchReady(state) {
    try {
      window.dispatchEvent(new CustomEvent(READY_EVENT, {
        detail: {
          state: state,
          isAuthenticated: !!isAuthenticated
        }
      }));
    } catch (error) {}
  }

  function getHeadingText(heading) {
    return (heading && heading.textContent ? heading.textContent : '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function findHeroHeading() {
    var headings = Array.prototype.slice.call(document.querySelectorAll('#root h1'));
    var i;

    for (i = 0; i < headings.length; i += 1) {
      if (headings[i].getAttribute('data-igcsefy-home-greeting') === 'true') {
        return headings[i];
      }
    }

    for (i = 0; i < headings.length; i += 1) {
      var text = getHeadingText(headings[i]);
      if (/welcome back|study smarter|revise better/.test(text)) {
        return headings[i];
      }
    }

    return headings.length ? headings[0] : null;
  }

  function storeOriginalHero(heading) {
    if (!heading || originalHeroHTML) return;
    var text = getHeadingText(heading);
    if (/study smarter|revise better/.test(text) && !/welcome back/.test(text)) {
      originalHeroHTML = heading.innerHTML;
    }
  }

  function syncHeroTheme() {
    var heading = findHeroHeading();
    if (!heading) return false;

    var leadLine = heading.querySelector('[data-welcome-line="lead"]');
    var nameLine = heading.querySelector('[data-welcome-line="name"]');
    var isGreeting = heading.getAttribute('data-igcsefy-home-greeting') === 'true' ||
      getHeadingText(heading).indexOf('welcome back') === 0;

    if (isGreeting) {
      if (isLightTheme()) {
        setImportantColor(heading, '#000000');
        setImportantColor(leadLine, '#000000');
        setImportantColor(nameLine, '#CDBDA7');
      } else {
        setImportantColor(heading, '');
        setImportantColor(leadLine, '');
        setImportantColor(nameLine, 'rgba(255,255,255,0.5)');
      }
      dispatchReady('authenticated');
      return true;
    }

    setImportantColor(heading, '');
    setImportantColor(leadLine, '');
    setImportantColor(nameLine, '');
    dispatchReady('default');
    return true;
  }

  function applyGreeting() {
    if (!currentUser || !currentUser.firstName) return false;

    var heading = findHeroHeading();
    if (!heading) return false;

    storeOriginalHero(heading);

    var nextHTML = buildGreetingHTML(currentUser.firstName);
    if (heading.innerHTML !== nextHTML || heading.getAttribute('data-igcsefy-home-greeting') !== 'true') {
      heading.innerHTML = nextHTML;
      heading.setAttribute('data-igcsefy-home-greeting', 'true');
    }

    return syncHeroTheme();
  }

  function restoreDefaultHero() {
    var heading = findHeroHeading();
    if (!heading) return false;

    storeOriginalHero(heading);

    if (originalHeroHTML && heading.getAttribute('data-igcsefy-home-greeting') === 'true') {
      heading.innerHTML = originalHeroHTML;
    }
    heading.removeAttribute('data-igcsefy-home-greeting');

    return syncHeroTheme();
  }

  function applyDesiredHero() {
    if (!authResolved) return false;
    if (isAuthenticated && (!currentUser || !currentUser.firstName)) return false;
    return isAuthenticated ? applyGreeting() : restoreDefaultHero();
  }

  function scheduleApply() {
    if (applyQueued) return;
    applyQueued = true;
    window.requestAnimationFrame(function () {
      applyQueued = false;
      applyDesiredHero();
    });
  }

  function ensureThemeObserver() {
    if (themeObserver) return;
    themeObserver = new MutationObserver(scheduleApply);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });
  }

  function ensureHeroObserver() {
    if (heroObserver || !document.body) return;
    heroObserver = new MutationObserver(scheduleApply);
    heroObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  ensureGreetingFallbackStyles();
  ensureThemeObserver();

  window.addEventListener(AUTH_EVENT, function (event) {
    var detail = event && event.detail ? event.detail : {};
    authResolved = true;
    isAuthenticated = !!detail.isAuthenticated;
    if (!isAuthenticated) {
      currentUser = null;
    }
    scheduleApply();
  });

  window.addEventListener('igcsefy:user-ready', function (event) {
    var user = event && event.detail ? event.detail.user : null;
    if (!user) return;
    authResolved = true;
    isAuthenticated = true;
    currentUser = user;
    scheduleApply();
  });

  window.addEventListener('igcsefy:theme-change', scheduleApply);

  var cachedUser =
    window.igcsefyUser &&
    typeof window.igcsefyUser.get === 'function'
      ? window.igcsefyUser.get()
      : null;

  if (cachedUser && cachedUser.firstName) {
    authResolved = true;
    isAuthenticated = true;
    currentUser = cachedUser;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      ensureHeroObserver();
      scheduleApply();
    }, { once: true });
  } else {
    ensureHeroObserver();
    scheduleApply();
  }
})();
