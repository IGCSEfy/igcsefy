// IGCSEfy User Identity
// Bridges Supabase auth into a shared in-memory cache accessible across all pages.
// Fires 'igcsefy:user-ready' on window when user data is confirmed.
//
// REFACTORED: Removed all localStorage usage for user identity.
// User data is sourced exclusively from Supabase auth events.
// In-memory cache (_userCache) is used for fast synchronous access within a page session.
// This eliminates the "empty flash then data kicks in" problem on new browser sessions.
(function () {
  var AUTH_EVENT = 'igcsefy:supabase-auth-change';
  var EVENT_NAME = 'igcsefy:user-ready';

  // In-memory cache only — never persisted to localStorage
  var _userCache = null;

  function getInitials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }

  function getFirstName(name) {
    if (!name) return '';
    return name.trim().split(/\s+/)[0];
  }

  function normalizeUser(user, fallback) {
    var base = fallback && typeof fallback === 'object' ? fallback : {};
    var source = user && typeof user === 'object' ? user : {};
    var name = typeof source.name === 'string' && source.name.trim()
      ? source.name.trim()
      : (base.name || '');
    var email = typeof source.email === 'string'
      ? source.email
      : (base.email || '');
    var avatar = typeof source.avatar === 'string'
      ? source.avatar
      : (base.avatar || '');

    return {
      name: name,
      email: email,
      avatar: avatar,
      initials: getInitials(name),
      firstName: getFirstName(name)
    };
  }

  function buildUserFromSupabaseUser(user) {
    if (!user) return null;
    var meta = user.user_metadata || {};
    var name = meta.full_name || meta.name || meta.username || user.email || '';
    return normalizeUser({
      name: name,
      email: user.email || '',
      avatar: meta.avatar_url || meta.avatar || ''
    });
  }

  function dispatch(user) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { user: user } }));
    } catch (e) {}
  }

  function setCache(user, shouldDispatch) {
    _userCache = user ? normalizeUser(user, _userCache) : null;
    if (_userCache && shouldDispatch !== false) {
      dispatch(_userCache);
    }
    return _userCache;
  }

  // Expose helpers globally — reads from in-memory cache only
  window.igcsefyUser = {
    get: function () { return _userCache; },
    getInitials: function () { return getInitials(_userCache && _userCache.name); },
    getFirstName: function () { return getFirstName(_userCache && _userCache.name); },
    getAvatar: function () { return _userCache && _userCache.avatar ? _userCache.avatar : ''; },
    set: function (user, shouldDispatch) {
      return setCache(user, shouldDispatch);
    },
    fromSupabaseUser: function (user, shouldDispatch) {
      var next = buildUserFromSupabaseUser(user);
      _userCache = next;
      if (next && shouldDispatch !== false) {
        dispatch(next);
      }
      return next;
    },
    clear: function () { _userCache = null; }
  };

  // When Supabase auth resolves, update in-memory cache and fire the event
  window.addEventListener(AUTH_EVENT, function (e) {
    if (e.detail && e.detail.isAuthenticated && e.detail.user) {
      window.igcsefyUser.fromSupabaseUser(e.detail.user, true);
    } else if (e.detail && !e.detail.isAuthenticated) {
      _userCache = null;
    }
  });

  var existingSupabaseUser =
    window.igcsefySupabase &&
    window.igcsefySupabase.currentUser
      ? window.igcsefySupabase.currentUser
      : null;

  if (existingSupabaseUser && !_userCache) {
    window.igcsefyUser.fromSupabaseUser(existingSupabaseUser, true);
  }

  // NOTE: No localStorage read on init. The Supabase client fires
  // igcsefy:supabase-auth-change as soon as it detects a session,
  // which then populates the cache and fires igcsefy:user-ready.
  // This prevents the "stale cache -> flash empty -> real data arrives" pattern.
})();
