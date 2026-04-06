(function () {
  var SETTINGS_KEY = 'igcsefy-settings';
  var NAV_THEME_ICON_KEY = 'igcsefy-nav-theme-icon';
  var THEMES = ['light', 'dark', 'system'];
  var NAV_ITEMS = [
    { key: 'home', label: 'Home', href: '/' },
    { key: 'subjects', label: 'Subjects', href: '/subjects/' },
    { key: 'past-papers', label: 'Past Papers', href: '/past-papers/' },
    { key: 'about', label: 'About', href: '/about/' }
  ];

  function normalizePath(pathname) {
    var clean = String(pathname || '/')
      .replace(/index\.html$/i, '')
      .replace(/\.html$/i, '')
      .replace(/\/{2,}/g, '/');

    if (!clean) {
      return '/';
    }

    return clean.charAt(clean.length - 1) === '/' ? clean : clean + '/';
  }

  function getActiveKey(pathname) {
    var path = normalizePath(pathname);

    if (path === '/') {
      return 'home';
    }

    if (
      /^\/(?:subjects|resources)(?:\/|$)/i.test(path) ||
      /^\/pages\/subjects\/?$/i.test(path)
    ) {
      return 'subjects';
    }

    if (
      /^\/past-papers(?:\/|$)/i.test(path) ||
      /^\/pages\/pastpapers\/?$/i.test(path) ||
      /^\/pages\/past-papers\/?$/i.test(path)
    ) {
      return 'past-papers';
    }

    if (/^\/about(?:\/|$)/i.test(path) || /^\/pages\/about\/?$/i.test(path)) {
      return 'about';
    }

    return null;
  }

  function iconMenu() {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M4 7h16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>' +
        '<path d="M4 12h16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>' +
        '<path d="M4 17h16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>' +
      '</svg>'
    );
  }

  function iconClose() {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M6 6l12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>' +
        '<path d="M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"></path>' +
      '</svg>'
    );
  }

  function iconUser() {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '<path d="M5 20a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '</svg>'
    );
  }

  function iconSettings() {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" fill="none" stroke="currentColor" stroke-width="1.7"></path>' +
        '<path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1 0 2.8 2 2 0 0 1-2.8 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8 0 2 2 0 0 1 0-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 0-2.8 2 2 0 0 1 2.8 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 0 2 2 0 0 1 0 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.7Z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '</svg>'
    );
  }

  function iconSun() {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"></circle>' +
        '<path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>' +
      '</svg>'
    );
  }

  function iconMoon() {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M20.2 15.4A8.2 8.2 0 0 1 8.6 3.8 8.8 8.8 0 1 0 20.2 15.4Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '</svg>'
    );
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isTheme(value) {
    return THEMES.indexOf(value) !== -1;
  }

  function readStoredSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function writeStoredSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      // Ignore storage failures so navigation still works.
    }
  }

  function getThemePreference() {
    var settings = readStoredSettings();
    var appearanceTheme = settings && settings.appearance ? settings.appearance.theme : '';

    if (isTheme(appearanceTheme)) {
      return appearanceTheme;
    }

    try {
      if (localStorage.getItem(NAV_THEME_ICON_KEY) === 'light') {
        return 'light';
      }
    } catch (error) {
      // Ignore storage failures; fall back to dark.
    }

    return 'dark';
  }

  function resolveTheme(preference) {
    if (preference === 'system') {
      try {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          return 'dark';
        }
      } catch (error) {
        return 'dark';
      }
      return 'light';
    }

    return preference === 'light' ? 'light' : 'dark';
  }

  function applyDocumentTheme(preference) {
    var themePreference = isTheme(preference) ? preference : getThemePreference();
    var resolvedTheme = resolveTheme(themePreference);
    var html = document.documentElement;

    html.classList.remove('light', 'dark');
    html.classList.add(resolvedTheme);
    html.dataset.theme = resolvedTheme;
    html.dataset.themePreference = themePreference;

    return {
      preference: themePreference,
      resolved: resolvedTheme
    };
  }

  function persistThemePreference(themePreference) {
    var settings = readStoredSettings() || {};
    var appearance = settings.appearance && typeof settings.appearance === 'object'
      ? settings.appearance
      : {};
    var nextPreference = themePreference === 'light' ? 'light' : 'dark';

    settings.appearance = Object.assign({}, appearance, { theme: nextPreference });
    writeStoredSettings(settings);

    try {
      localStorage.setItem(NAV_THEME_ICON_KEY, nextPreference);
    } catch (error) {
      // Ignore storage failures; the theme class is already applied.
    }

    var themeState = applyDocumentTheme(nextPreference);

    try {
      window.dispatchEvent(new CustomEvent('igcsefy:theme-change', {
        detail: {
          preference: themeState.preference,
          resolved: themeState.resolved,
          source: 'site-nav'
        }
      }));
    } catch (error) {
      // Ignore dispatch failures.
    }

    return themeState;
  }

  function getInitials(name) {
    if (!name) {
      return '?';
    }

    return String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) { return part.charAt(0); })
      .join('')
      .toUpperCase() || '?';
  }

  function readStoredAccount() {
    try {
      var raw = localStorage.getItem('igcsefy-account');
      if (!raw) {
        return null;
      }

      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function hasSupabaseSession() {
    try {
      var raw = localStorage.getItem('sb-qkxnqwcvgclcxmghbjaa-auth-token');
      if (!raw) {
        return false;
      }

      if (raw.indexOf('access_token') !== -1) {
        return true;
      }

      var parsed = JSON.parse(raw);
      if (!parsed) {
        return false;
      }

      if (parsed.currentSession && parsed.currentSession.access_token) {
        return true;
      }

      if (parsed.access_token) {
        return true;
      }

      return Array.isArray(parsed) && parsed.some(function (entry) {
        return entry && entry.access_token;
      });
    } catch (error) {
      return false;
    }
  }

  function userInitialsMarkup(initials) {
    return '<span class="site-nav__initials">' + initials + '</span>';
  }

  function userAvatarMarkup(avatar, name) {
    return (
      '<span class="site-nav__avatar">' +
        '<img class="site-nav__avatar-image" src="' + escapeHtml(avatar) + '" alt="' + escapeHtml((name || 'Profile') + ' avatar') + '">' +
      '</span>'
    );
  }

  function getNavUserDisplay() {
    try {
      var cached = window.igcsefyUser && window.igcsefyUser.get && window.igcsefyUser.get();
      if (cached && cached.avatar) {
        return userAvatarMarkup(cached.avatar, cached.name);
      }
      if (cached && cached.initials && cached.initials !== '?') {
        return userInitialsMarkup(cached.initials);
      }
    } catch (error) {
      // Ignore identity lookup failures; the nav falls back to the icon.
    }

    var stored = hasSupabaseSession() ? readStoredAccount() : null;
    if (stored && stored.avatar) {
      return userAvatarMarkup(stored.avatar, stored.name);
    }
    if (stored && stored.name) {
      return userInitialsMarkup(getInitials(stored.name));
    }

    return iconUser();
  }

  function buildDesktopLinks(activeKey) {
    return NAV_ITEMS.map(function (item) {
      return (
        '<a class="site-nav__link' + (activeKey === item.key ? ' is-active' : '') + '" href="' + item.href + '">' +
          (activeKey === item.key ? '<span class="site-nav__link-indicator" aria-hidden="true"></span>' : '') +
          '<span class="site-nav__link-label">' + item.label + '</span>' +
        '</a>'
      );
    }).join('');
  }

  function buildPanelLinks(activeKey) {
    return NAV_ITEMS.map(function (item, index) {
      return (
        '<a class="site-nav__mobile-link' + (activeKey === item.key ? ' is-active' : '') + '" href="' + item.href + '" style="--site-nav-link-delay:' + (index * 40) + 'ms">' +
          item.label +
        '</a>'
      );
    }).join('');
  }

  function hardenNavRoot(root) {
    var fixedStyles = [
      ['position', 'fixed'],
      ['top', '0'],
      ['right', '0'],
      ['left', '0'],
      ['bottom', 'auto'],
      ['display', 'block'],
      ['width', '100%'],
      ['z-index', '320'],
      ['pointer-events', 'none'],
      ['background', 'transparent'],
      ['border-bottom', '0'],
      ['box-shadow', 'none'],
      ['backdrop-filter', 'none'],
      ['-webkit-backdrop-filter', 'none'],
      ['transform', 'none'],
      ['transition', 'none'],
      ['isolation', 'auto'],
      ['overflow', 'visible']
    ];

    fixedStyles.forEach(function (entry) {
      root.style.setProperty(entry[0], entry[1], 'important');
    });
  }

  function buildNav() {
    var activeKey = getActiveKey(window.location.pathname);
    var themeState = applyDocumentTheme();
    var themeIcon = themeState.resolved;

    var root = document.createElement('header');
    root.className = 'site-nav';
    root.dataset.open = 'false';
    root.dataset.scrolled = window.scrollY > 8 ? 'true' : 'false';
    root.dataset.themeIcon = themeIcon;
    root.dataset.themePreference = themeState.preference;
    hardenNavRoot(root);
    root.innerHTML =
      '<div class="site-nav__overlay" aria-hidden="true"></div>' +
      '<div class="site-nav__bar">' +
        '<div class="site-nav__inner">' +
          '<a class="site-nav__brand" href="/">IGCSEfy</a>' +
          '<nav class="site-nav__desktop" aria-label="Primary navigation">' +
            buildDesktopLinks(activeKey) +
          '</nav>' +
          '<button class="site-nav__toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav-panel">' +
            '<span class="site-nav__toggle-icon site-nav__toggle-icon--menu" aria-hidden="true">' + iconMenu() + '</span>' +
            '<span class="site-nav__toggle-icon site-nav__toggle-icon--close" aria-hidden="true">' + iconClose() + '</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="site-nav__panel" id="site-nav-panel" aria-hidden="true">' +
        '<div class="site-nav__panel-outer">' +
          '<div class="site-nav__panel-card">' +
            '<nav class="site-nav__mobile" aria-label="Expanded navigation">' +
              buildPanelLinks(activeKey) +
            '</nav>' +
            '<div class="site-nav__divider" aria-hidden="true"></div>' +
            '<div class="site-nav__actions" aria-label="Quick actions">' +
              '<a class="site-nav__action" href="/profile/" aria-label="Profile">' + getNavUserDisplay() + '</a>' +
              '<button class="site-nav__action-button" type="button" aria-label="Toggle theme" aria-pressed="' + (themeIcon === 'light' ? 'true' : 'false') + '">' +
                '<span class="site-nav__theme" aria-hidden="true">' +
                  '<span class="site-nav__theme-icon site-nav__theme-icon--sun">' + iconSun() + '</span>' +
                  '<span class="site-nav__theme-icon site-nav__theme-icon--moon">' + iconMoon() + '</span>' +
                '</span>' +
              '</button>' +
              '<a class="site-nav__action" href="/settings/" aria-label="Settings">' + iconSettings() + '</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    return root;
  }

  function ensureSpacerAfter(nav) {
    var spacer = nav.nextElementSibling;

    if (!spacer || !spacer.classList.contains('site-nav-spacer')) {
      spacer = document.createElement('div');
      spacer.className = 'site-nav-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      nav.insertAdjacentElement('afterend', spacer);
    }

    return spacer;
  }

  function findLegacyHeader() {
    var children = Array.prototype.slice.call(document.body.children);

    for (var i = 0; i < children.length; i += 1) {
      if (children[i].tagName === 'HEADER' && !children[i].classList.contains('site-nav')) {
        return children[i];
      }
    }

    return null;
  }

  function setSharedSize(nav, name, value) {
    nav.style.setProperty(name, value);
    document.documentElement.style.setProperty(name, value);
  }

  function bindNav(nav, spacer) {
    if (nav.dataset.bound === 'true') {
      if (typeof nav.__siteNavSync === 'function') {
        nav.__siteNavSync();
      }
      return;
    }

    nav.dataset.bound = 'true';

    var html = document.documentElement;
    var body = document.body;
    var bar = nav.querySelector('.site-nav__bar');
    var toggle = nav.querySelector('.site-nav__toggle');
    var overlay = nav.querySelector('.site-nav__overlay');
    var panel = nav.querySelector('.site-nav__panel');
    var themeToggle = nav.querySelector('.site-nav__action-button');
    var closeTargets = nav.querySelectorAll('a[href]');
    var syncFrame = 0;
    var lastScrollbarCompensation = 0;
    var systemThemeQuery = null;

    function syncThemeState(preference) {
      var themeState = applyDocumentTheme(preference);
      nav.dataset.themeIcon = themeState.resolved;
      nav.dataset.themePreference = themeState.preference;

      if (themeToggle) {
        themeToggle.setAttribute('aria-pressed', themeState.resolved === 'light' ? 'true' : 'false');
      }

      return themeState;
    }

    function measureScrollbarCompensation() {
      return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    }

    function syncScrollbarCompensation() {
      if (nav.dataset.open !== 'true') {
        lastScrollbarCompensation = measureScrollbarCompensation();
      }

      setSharedSize(
        nav,
        '--site-nav-scrollbar-compensation',
        (nav.dataset.open === 'true' ? lastScrollbarCompensation : 0) + 'px'
      );
    }

    function syncLayout() {
      var barHeight = Math.max(1, Math.ceil(bar.getBoundingClientRect().height || 56));
      var panelHeight = Math.max(0, Math.ceil(panel.scrollHeight || 0));
      var totalHeight = barHeight;

      syncScrollbarCompensation();
      setSharedSize(nav, '--site-nav-bar-height', barHeight + 'px');
      setSharedSize(nav, '--site-nav-panel-height', panelHeight + 'px');
      setSharedSize(nav, '--site-nav-offset', totalHeight + 'px');
      setSharedSize(nav, '--nav-h', totalHeight + 'px');

      spacer.style.height = totalHeight + 'px';
    }

    function queueLayoutSync() {
      if (syncFrame) {
        cancelAnimationFrame(syncFrame);
      }

      syncFrame = requestAnimationFrame(function () {
        syncFrame = 0;
        syncLayout();
      });
    }

    function setScrolled() {
      nav.dataset.scrolled = window.scrollY > 8 ? 'true' : 'false';
    }

    function setOpen(open) {
      var isOpen = !!open;

      if (isOpen) {
        lastScrollbarCompensation = measureScrollbarCompensation();
      }

      nav.dataset.open = isOpen ? 'true' : 'false';
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
      panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      overlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

      html.classList.toggle('site-nav-open', isOpen);
      body.classList.toggle('site-nav-open', isOpen);

      queueLayoutSync();
    }

    nav.__siteNavSync = queueLayoutSync;

    toggle.addEventListener('click', function () {
      setOpen(nav.dataset.open !== 'true');
    });

    overlay.addEventListener('click', function () {
      setOpen(false);
    });

    Array.prototype.forEach.call(closeTargets, function (link) {
      link.addEventListener('click', function () {
        setOpen(false);
      });
    });

    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        var currentState = syncThemeState();
        var nextTheme = currentState.resolved === 'light' ? 'dark' : 'light';
        syncThemeState(persistThemePreference(nextTheme).preference);
      });
    }

    try {
      if (window.matchMedia) {
        systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        if (systemThemeQuery && typeof systemThemeQuery.addEventListener === 'function') {
          systemThemeQuery.addEventListener('change', function () {
            if (getThemePreference() === 'system') {
              syncThemeState('system');
            }
          });
        }
      }
    } catch (error) {
      systemThemeQuery = null;
    }

    window.addEventListener('storage', function (event) {
      if (!event || (event.key !== SETTINGS_KEY && event.key !== NAV_THEME_ICON_KEY)) {
        return;
      }

      syncThemeState();
    });

    window.addEventListener('igcsefy:theme-change', function (event) {
      if (event && event.detail && event.detail.source === 'site-nav') {
        return;
      }
      syncThemeState();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    });

    window.addEventListener('scroll', setScrolled, { passive: true });
    window.addEventListener('resize', queueLayoutSync);
    window.addEventListener('load', queueLayoutSync);

    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(queueLayoutSync).catch(function () {
        // Ignore font readiness failures; the initial layout sync already ran.
      });
    }

    setOpen(false);
    setScrolled();
    syncThemeState();
    queueLayoutSync();
  }

  function mountNav() {
    var existingNav = document.querySelector('.site-nav');

    if (existingNav) {
      hardenNavRoot(existingNav);
      document.body.classList.add('has-site-nav');
      document.documentElement.classList.add('site-nav-ready');
      bindNav(existingNav, ensureSpacerAfter(existingNav));
      return;
    }

    var nav = buildNav();
    var preserveHeader = document.body.hasAttribute('data-site-nav-preserve-header');
    var legacyHeader = preserveHeader ? null : findLegacyHeader();

    if (legacyHeader) {
      legacyHeader.replaceWith(nav);
    } else if (document.body.firstChild) {
      document.body.insertBefore(nav, document.body.firstChild);
    } else {
      document.body.appendChild(nav);
    }

    document.body.classList.add('has-site-nav');
    document.documentElement.classList.add('site-nav-ready');

    bindNav(nav, ensureSpacerAfter(nav));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountNav, { once: true });
  } else {
    mountNav();
  }

  window.addEventListener('igcsefy:user-ready', function (event) {
    var profileLink = document.querySelector('.site-nav__action[href="/profile/"]');
    if (!profileLink) {
      return;
    }

    var user = event.detail && event.detail.user;
    if (user && user.avatar) {
      profileLink.innerHTML = userAvatarMarkup(user.avatar, user.name);
    } else if (user && user.initials && user.initials !== '?') {
      profileLink.innerHTML = userInitialsMarkup(user.initials);
    } else {
      profileLink.innerHTML = getNavUserDisplay();
    }

    var nav = document.querySelector('.site-nav');
    if (nav && typeof nav.__siteNavSync === 'function') {
      nav.__siteNavSync();
    }
  });
})();
