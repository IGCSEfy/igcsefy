// IGCSEfy Profile User Patch
// The React profile bundle uses Sr.auth.me() (Base44 SDK) to load the user
// and renders their full_name, email, and initials directly in the component.
//
// The profile root mounts before React finishes painting user identity.
// This script patches the visible header from Supabase user data immediately,
// so there is no visible placeholder or empty-state flash.
//
// PERFORMANCE: The observer is lightweight and debounced to animation frames.
// It stays active so React re-renders cannot drop the patched identity UI.

(function () {
  'use strict';

  var READY_EVENT = 'igcsefy:profile-user-patched';

  function getAuthProvider(sbUser) {
    if (!sbUser) return 'Email';
    var identities = sbUser.identities || [];
    for (var i = 0; i < identities.length; i++) {
      if ((identities[i].provider || '').toLowerCase() === 'google') return 'Google';
    }
    var appMeta = sbUser.app_metadata || {};
    if ((appMeta.provider || '').toLowerCase() === 'google') return 'Google';
    return 'Email';
  }

  var _user     = null;
  var _sbUser   = null;
  var _observer = null;
  var _done     = { avatar: false, name: false, email: false, provider: false };
  var _readyNotified = false;

  function allDone() {
    return _done.avatar && _done.name && _done.email;
  }

  function notifyReady() {
    if (_readyNotified) return;
    _readyNotified = true;
    try {
      window.dispatchEvent(new CustomEvent(READY_EVENT, {
        detail: {
          user: _user,
          provider: getAuthProvider(_sbUser)
        }
      }));
    } catch (error) {}
  }

  function resetPatchState() {
    _done = { avatar: false, name: false, email: false, provider: false };
  }

  function applyAvatar(el, avatar, initials) {
    if (!el) return;

    if (avatar) {
      el.textContent = '';
      var existing = el.querySelector('[data-igcsefy-profile-avatar]');
      if (!existing) {
        var img = document.createElement('img');
        img.setAttribute('data-igcsefy-profile-avatar', 'true');
        img.alt = 'Profile avatar';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '9999px';
        el.appendChild(img);
        existing = img;
      }
      existing.src = avatar;
      return;
    }

    el.textContent = initials;
  }

  function applyUser() {
    if (!_user) return;
    var name     = _user.name     || '';
    var initials = _user.initials || '?';
    var email    = _user.email    || '';
    var avatar   = _user.avatar   || '';
    var provider = 'via ' + getAuthProvider(_sbUser);

    if (!_done.avatar) {
      document.querySelectorAll('#root .rounded-full').forEach(function (el) {
        var t = (el.textContent || '').trim();
        if (t === initials || t === '?' || t === 'Student' || el.querySelector('[data-igcsefy-profile-avatar]') || el.querySelector('img')) {
          applyAvatar(el, avatar, initials);
          _done.avatar = true;
        }
      });
    }
    if (!_done.name && name) {
      document.querySelectorAll('#root h1').forEach(function (el) {
        var t = (el.textContent || '').trim();
        if (t === name) { _done.name = true; return; }
        if (t === 'Student' || t === '') { el.textContent = name; _done.name = true; }
      });
    }
    if (!_done.email && email && name) {
      document.querySelectorAll('#root h1').forEach(function (h) {
        if ((h.textContent || '').trim() !== name) return;
        var sib = h.nextElementSibling;
        if (sib && sib.tagName === 'P') {
          if ((sib.textContent || '').trim() === email) {
            _done.email = true;
          } else if (!(sib.textContent || '').trim()) {
            sib.textContent = email; _done.email = true;
          }
        }
      });
    }
    if (!_done.provider) {
      document.querySelectorAll('#root span').forEach(function (el) {
        var t = (el.textContent || '').trim();
        if (t === provider) { _done.provider = true; return; }
        if (t === 'via Email' || t === 'via Google') { el.textContent = provider; _done.provider = true; }
      });
    }

    if (allDone()) {
      notifyReady();
    }
  }

  function startObserver() {
    if (_observer) return;
    var root = document.getElementById('root');
    if (!root) return;
    var ticking = false;
    _observer = new MutationObserver(function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        resetPatchState();
        applyUser();
      });
    });
    _observer.observe(root, { childList: true, subtree: true });
  }

  window.addEventListener('igcsefy:supabase-auth-change', function (e) {
    if (e.detail && e.detail.isAuthenticated && e.detail.user) {
      _sbUser = e.detail.user;
      resetPatchState();
      applyUser();
    } else if (e.detail && !e.detail.isAuthenticated) {
      _readyNotified = false;
    }
  });

  window.addEventListener('igcsefy:user-ready', function (e) {
    if (e.detail && e.detail.user) {
      _user = e.detail.user;
      resetPatchState();
      _readyNotified = false;
      applyUser();
      startObserver();
    }
  });

  function tryFromCache() {
    // igcsefyUser.get() is now in-memory only (no localStorage backing).
    // On page load before Supabase auth resolves this returns null — correct.
    // The igcsefy:user-ready listener above handles patching once auth confirms.
    var cached = window.igcsefyUser && window.igcsefyUser.get();
    if (cached && !_user) { _user = cached; applyUser(); startObserver(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryFromCache);
  } else {
    tryFromCache();
  }

})();
