(function () {
  // ─── Config ────────────────────────────────────────────────────────────────
  const SUPABASE_URL      = 'https://qkxnqwcvgclcxmghbjaa.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFreG5xd2N2Z2NsY3htZ2hiamFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MTc5NTgsImV4cCI6MjA4MzE5Mzk1OH0.Oguf5ne0-tp6MKqj2SN2dEKA4Sl7mdmNgMLJ4BrZScw';
  const ADAPTER_READY_EVENT = 'igcsefy:data-adapter-ready';
  const AUTH_EVENT          = 'igcsefy:supabase-auth-change';
  const PROFILE_PATCH_READY_EVENT = 'igcsefy:profile-patch-ready';
  const PROFILE_PATCH_STATE_KEY = '__igcsefyProfilePatchReady';
  const REQUIRED_PROFILE_PATCH_STEPS = ['subject-filter', 'progress', 'syllabus'];

  // ─── Key prefix for past papers stored in user_topic_states ────────────────
  // Past paper track keys are stored with this prefix so they share the table
  // with syllabus topic states but can be distinguished on read.
  const PAPER_PREFIX = 'pp|';

  // ─── DB state values ───────────────────────────────────────────────────────
  // The Supabase schema now accepts the same topic states the client uses, so
  // these adapters are intentionally no-ops.

  function toDbState(state) {
    return state;
  }

  function fromDbState(dbState) {
    return dbState;
  }

  function getProfilePatchState() {
    if (!window[PROFILE_PATCH_STATE_KEY] || typeof window[PROFILE_PATCH_STATE_KEY] !== 'object') {
      window[PROFILE_PATCH_STATE_KEY] = {};
    }

    return window[PROFILE_PATCH_STATE_KEY];
  }

  function hasRequiredProfilePatchSteps() {
    var state = getProfilePatchState();

    return REQUIRED_PROFILE_PATCH_STEPS.every(function (step) {
      return !!state[step];
    });
  }

  const SUBJECTS = {
    '0266': { slug: 'psychology-0266',                   name: 'Psychology' },
    '0450': { slug: 'business-studies-0450',             name: 'Business Studies' },
    '0452': { slug: 'accounting-0452',                   name: 'Accounting' },
    '0455': { slug: 'economics-0455',                    name: 'Economics' },
    '0478': { slug: 'computer-science-0478',             name: 'Computer Science' },
    '0495': { slug: 'sociology-0495',                    name: 'Sociology' },
    '0500': { slug: 'english-first-language-0500',       name: 'English Language' },
    '0510': { slug: 'english-as-a-second-language-0510', name: 'English as a Second Language' },
    '0580': { slug: 'mathematics-0580',                  name: 'Mathematics' },
    '0610': { slug: 'biology-0610',                      name: 'Biology' },
    '0620': { slug: 'chemistry-0620',                    name: 'Chemistry' },
    '0625': { slug: 'physics-0625',                      name: 'Physics' }
  };

  // ─── Guard ─────────────────────────────────────────────────────────────────
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('IGCSEfy: Supabase CDN failed to load.');
    return;
  }

  // ─── Supabase client ───────────────────────────────────────────────────────
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
      flowType:           'implicit'
    }
  });

  // ─── Auth state ────────────────────────────────────────────────────────────
  var currentUser = null;
  var authResolve;
  var authReady = new Promise(function (resolve) { authResolve = resolve; });

  client.auth.onAuthStateChange(function (event, session) {
    currentUser = (session && session.user) ? session.user : null;
    authResolve();
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, {
      detail: {
        event: String(event || ''),
        user: currentUser,
        isAuthenticated: !!currentUser
      }
    }));
    window.dispatchEvent(new CustomEvent(ADAPTER_READY_EVENT));

    if (!currentUser) {
      remoteTopics = {};
      remoteSubjects = {};
      remoteLoaded = false;

      try {
        var existingStore = window.igcsefyDataStore;
        if (existingStore && typeof existingStore.replaceSnapshot === 'function') {
          existingStore.replaceSnapshot(createEmptySnapshot(), 'remote-signout', {
            preservePreferences: false
          });
        }
      } catch (clearErr) {
        console.error('IGCSEfy sign-out clear failed:', clearErr);
      }

      return;
    }

    loadSnapshot().then(function (remoteSnapshot) {
      if (!remoteSnapshot) return;

      function pushToStore() {
        var store = window.igcsefyDataStore;
        if (store) {
          try {
            if (typeof store.replaceSnapshot === 'function') {
              store.replaceSnapshot(remoteSnapshot, 'remote-load');
            } else {
              if (remoteSnapshot.trackedSubjects && typeof store.setTrackedSubjects === 'function') {
                store.setTrackedSubjects(remoteSnapshot.trackedSubjects);
              }
              if (remoteSnapshot.syllabusTopicStates && typeof store.setSyllabusStates === 'function') {
                store.setSyllabusStates(remoteSnapshot.syllabusTopicStates);
              }
              if (remoteSnapshot.pastPaperStatuses) {
                if (typeof store.setPastPaperStatuses === 'function') {
                  store.setPastPaperStatuses(remoteSnapshot.pastPaperStatuses);
                } else if (typeof store.setPastPaperStatus === 'function') {
                  Object.keys(remoteSnapshot.pastPaperStatuses).forEach(function (k) {
                    store.setPastPaperStatus(k, remoteSnapshot.pastPaperStatuses[k]);
                  });
                }
              }
            }
          } catch (pushErr) {
            console.error('IGCSEfy store push failed:', pushErr);
          }
        } else {
          window.dispatchEvent(new CustomEvent(ADAPTER_READY_EVENT));
        }

        setTimeout(function () {
          window.dispatchEvent(new CustomEvent('igcsefy:data-change', {
            detail: { reason: 'remote-load' }
          }));
        }, 80);
      }

      if (window.igcsefyDataStore) {
        pushToStore();
      } else {
        var waited = 0;
        var iv = setInterval(function () {
          waited += 100;
          if (window.igcsefyDataStore) {
            clearInterval(iv);
            pushToStore();
          } else if (waited >= 4000) {
            clearInterval(iv);
          }
        }, 100);
      }
    }).catch(function (err) {
      console.error('IGCSEfy proactive load failed:', err);
    });
  });

  // ─── Utilities ─────────────────────────────────────────────────────────────
  function clone(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  function subjectFromCode(code) {
    var c = String(code || '').trim();
    var m = SUBJECTS[c] || null;
    return { code: c, slug: m ? m.slug : c, name: m ? m.name : c };
  }

  function normalizeSubjectLevel(level) {
    return level === 'core' || level === 'extended' ? level : null;
  }

  function assignSubjectPreference(subjectPreferences, subject, level) {
    var normalizedLevel = normalizeSubjectLevel(level);
    if (!normalizedLevel || !subject) return;

    if (subject.slug) {
      subjectPreferences[subject.slug] = { level: normalizedLevel, updatedAt: null };
    }
    if (subject.code) {
      subjectPreferences[subject.code] = { level: normalizedLevel, updatedAt: null };
    }
  }

  function getSnapshotSubjectLevel(snapshot, subject) {
    if (!subject) return null;

    var directLevel = normalizeSubjectLevel(subject.level);
    if (directLevel) return directLevel;

    var subjectPreferences = snapshot && snapshot.subjectPreferences ? snapshot.subjectPreferences : {};
    if (subject.slug && subjectPreferences[subject.slug]) {
      return normalizeSubjectLevel(subjectPreferences[subject.slug].level);
    }
    if (subject.code && subjectPreferences[subject.code]) {
      return normalizeSubjectLevel(subjectPreferences[subject.code].level);
    }

    return null;
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

  // ─── Auth actions ──────────────────────────────────────────────────────────
  function signInWithGoogle(redirectTo) {
    var url = new URL(redirectTo || '/profile/', window.location.origin).href;
    return client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: url, queryParams: { prompt: 'select_account' } }
    }).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function signOut() {
    return client.auth.signOut();
  }

  // ─── Remote knowledge cache ────────────────────────────────────────────────
  // Mirrors what's currently in Supabase. Lets saveDelta skip writes that
  // haven't changed, and prevents overwriting rows not yet loaded.
  var remoteTopics   = {};  // full topic_key (with prefix) → db state
  var remoteSubjects = {};  // subject_code → level|null
  var remoteLoaded   = false;

  // ─── Load from Supabase ────────────────────────────────────────────────────
  function loadSnapshot() {
    return authReady.then(function () {
      if (!currentUser) return null;
      var uid = currentUser.id;

      return Promise.all([
        client.from('user_subjects').select('subject_code, level').eq('user_id', uid),
        client.from('user_topic_states').select('topic_key, state').eq('user_id', uid)
      ]).then(function (results) {
        var subR   = results[0];
        var stateR = results[1];
        if (subR.error)   throw subR.error;
        if (stateR.error) throw stateR.error;

        remoteTopics   = {};
        remoteSubjects = {};
        remoteLoaded   = true;

        var trackedSubjects     = [];
        var subjectPreferences  = {};
        var syllabusTopicStates = {};
        var pastPaperStatuses   = {};

        (subR.data || []).forEach(function (r) {
          var subject = subjectFromCode(r.subject_code);
          var level = normalizeSubjectLevel(r.level);
          remoteSubjects[r.subject_code] = level;
          if (level) {
            subject.level = level;
            assignSubjectPreference(subjectPreferences, subject, level);
          }
          trackedSubjects.push(subject);
        });
        trackedSubjects = trackedSubjects.filter(function (r) { return r.code; });

        (stateR.data || []).forEach(function (row) {
          var key   = String(row.topic_key || '');
          var state = String(row.state     || '');
          if (!key || !state) return;
          remoteTopics[key] = state;
          if (key.indexOf(PAPER_PREFIX) === 0) {
            pastPaperStatuses[key.slice(PAPER_PREFIX.length)] = fromDbState(state, true);
          } else {
            syllabusTopicStates[key] = fromDbState(state, false);
          }
        });

        return {
          trackedSubjects:     trackedSubjects,
          subjectPreferences:  subjectPreferences,
          syllabusTopicStates: syllabusTopicStates,
          pastPaperStatuses:   pastPaperStatuses,
          updatedAt:           new Date().toISOString()
        };
      });
    });
  }

  // ─── Save delta to Supabase ────────────────────────────────────────────────
  // Compares incoming snapshot against remoteTopics cache.
  // Only writes rows that actually changed. Uses UPSERT — works because the
  // schema has unique(user_id, topic_key) and an UPDATE RLS policy.
  function saveDelta(snapshot) {
    return authReady.then(function () {
      if (!currentUser || !snapshot) return null;
      var uid = currentUser.id;
      var now = new Date().toISOString();

      var syllabus   = snapshot.syllabusTopicStates || {};
      var pastPapers = snapshot.pastPaperStatuses   || {};
      var subjects   = (Array.isArray(snapshot.trackedSubjects) ? snapshot.trackedSubjects : [])
        .map(function (s) {
          var subject = subjectFromCode(s && s.code ? s.code : s);
          var subjectRef = Object.assign({}, subject);
          if (s && typeof s === 'object') {
            if (s.slug) subjectRef.slug = s.slug;
            if (s.level) subjectRef.level = s.level;
          }
          var level = getSnapshotSubjectLevel(snapshot, subjectRef);
          if (level) {
            subject.level = level;
          }
          return subject;
        })
        .filter(function (s) { return s.code; });

      var nextTopics = {};
      Object.keys(syllabus).forEach(function (k) {
        nextTopics[k] = toDbState(syllabus[k]);
      });
      Object.keys(pastPapers).forEach(function (k) {
        nextTopics[PAPER_PREFIX + k] = toDbState(pastPapers[k]);
      });

      var nextSubjects = {};
      subjects.forEach(function (subject) {
        nextSubjects[subject.code] = normalizeSubjectLevel(subject.level);
      });

      var topicRowsToWrite = [];
      Object.keys(nextTopics).forEach(function (topicKey) {
        var dbState = nextTopics[topicKey];
        if (!remoteLoaded || remoteTopics[topicKey] !== dbState) {
          topicRowsToWrite.push({ user_id: uid, topic_key: topicKey, state: dbState, updated_at: now });
        }
      });

      var subjectRowsToWrite = subjects.filter(function (s) {
        return !remoteLoaded || remoteSubjects[s.code] !== normalizeSubjectLevel(s.level);
      }).map(function (s) {
        return {
          user_id: uid,
          subject_code: s.code,
          level: normalizeSubjectLevel(s.level)
        };
      });

      var topicKeysToDelete = remoteLoaded
        ? Object.keys(remoteTopics).filter(function (topicKey) {
            return !Object.prototype.hasOwnProperty.call(nextTopics, topicKey);
          })
        : [];

      var subjectCodesToDelete = remoteLoaded
        ? Object.keys(remoteSubjects).filter(function (code) {
            return !Object.prototype.hasOwnProperty.call(nextSubjects, code);
          })
        : [];

      var ops = [];

      if (topicRowsToWrite.length) {
        // upsert: INSERT ... ON CONFLICT (user_id, topic_key) DO UPDATE SET state, updated_at
        // Works because schema has unique(user_id, topic_key) + UPDATE RLS policy
        ops.push(
          client.from('user_topic_states')
            .upsert(topicRowsToWrite, { onConflict: 'user_id,topic_key' })
            .then(function (r) {
              if (r.error) {
                console.error('IGCSEfy topic state save error:', r.error);
                throw r.error;
              }
            })
        );
      }

      if (subjectRowsToWrite.length) {
        ops.push(
          client.from('user_subjects')
            .upsert(subjectRowsToWrite, { onConflict: 'user_id,subject_code' })
            .then(function (r) {
              if (r.error) {
                console.error('IGCSEfy subject save error:', r.error);
                throw r.error;
              }
            })
        );
      }

      if (topicKeysToDelete.length) {
        ops.push(
          client.from('user_topic_states')
            .delete()
            .eq('user_id', uid)
            .in('topic_key', topicKeysToDelete)
            .then(function (r) {
              if (r.error) {
                console.error('IGCSEfy topic state delete error:', r.error);
                throw r.error;
              }
            })
        );
      }

      if (subjectCodesToDelete.length) {
        ops.push(
          client.from('user_subjects')
            .delete()
            .eq('user_id', uid)
            .in('subject_code', subjectCodesToDelete)
            .then(function (r) {
              if (r.error) {
                console.error('IGCSEfy subject delete error:', r.error);
                throw r.error;
              }
            })
        );
      }

      return ops.length
        ? Promise.all(ops).then(function () {
            remoteTopics = Object.assign({}, nextTopics);
            remoteSubjects = Object.assign({}, nextSubjects);
            remoteLoaded = true;
            return clone(snapshot);
          })
        : Promise.resolve().then(function () {
            remoteTopics = Object.assign({}, nextTopics);
            remoteSubjects = Object.assign({}, nextSubjects);
            remoteLoaded = true;
            return clone(snapshot);
          });
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────
  window.igcsefySupabase = {
    client:           client,
    signInWithGoogle: signInWithGoogle,
    signOut:          signOut,
    loadSnapshot:     loadSnapshot,
    saveSnapshot:     saveDelta,
    get currentUser() { return currentUser; }
  };

  window.igcsefyDataStoreAdapter = {
    load: function () { return loadSnapshot(); },
    save: function (snap) { return saveDelta(snap); },
    subscribe: function (callback) {
      window.addEventListener(AUTH_EVENT, function (e) {
        if (e.detail && e.detail.isAuthenticated) {
          loadSnapshot().then(callback).catch(function (err) {
            console.error('IGCSEfy remote refresh failed:', err);
          });
        }
      });
      return function () {};
    }
  };

  // ─── Sign-in page ──────────────────────────────────────────────────────────
  function handleSignInPage() {
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('/pages/signin') === -1 && !path.endsWith('/signin.html')) return;

    var status = document.getElementById('signin-status');
    function setText(t) { if (status) status.textContent = t; }

    authReady.then(function () {
      if (currentUser) {
        setText('Signed in. Redirecting to your profile\u2026');
        window.location.replace('/profile/');
        return;
      }
      setText('Redirecting to Google sign in\u2026');
      signInWithGoogle('/profile/').catch(function (err) {
        console.error(err);
        setText('Google sign in could not start. Please try again.');
      });
    });
  }

  // ─── Profile page ──────────────────────────────────────────────────────────
  function handleProfilePage() {
    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('/profile') !== 0) return;

    var MOUNT_ID = 'igcsefy-supabase-profile-auth';
    var GATE_ID = 'igcsefy-profile-signin-gate';
    var PROFILE_READY_EVENT = 'igcsefy:profile-ready';
    var PROFILE_USER_READY_EVENT = 'igcsefy:profile-user-patched';
    var themeRefreshTimer = 0;
    var dashboardRevealTimer = 0;
    var dashboardPrepared = false;
    var remoteSnapshotReady = false;
    var profileUserReady = false;
    var profileDataReady = hasRequiredProfilePatchSteps();
    var lastProfileViewState = null;
    var revealQueued = false;

    function isLightTheme() {
      var root = document.documentElement;
      return root.classList.contains('light') || root.dataset.theme === 'light';
    }

    function clearThemeRefreshTimer() {
      if (themeRefreshTimer) {
        window.clearTimeout(themeRefreshTimer);
        themeRefreshTimer = 0;
      }
    }

    function clearDashboardRevealTimer() {
      if (dashboardRevealTimer) {
        window.clearTimeout(dashboardRevealTimer);
        dashboardRevealTimer = 0;
      }
    }

    function dispatchProfileReady(state) {
      try {
        window.dispatchEvent(new CustomEvent(PROFILE_READY_EVENT, {
          detail: { state: state || (currentUser ? 'dashboard' : 'signin') }
        }));
      } catch (error) {}
    }

    function buildGoogleIcon(lightTheme) {
      return '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.31-1.58-5.02-3.71H.96v2.33A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.98 10.71A5.41 5.41 0 0 1 3.7 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.02-2.33Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.33l2.57-2.57C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.96l3.02 2.33C4.69 5.16 6.66 3.58 9 3.58Z"/></svg>';
    }

    function buildGateStyles(lightTheme) {
      var palette = lightTheme
        ? {
            page: '#F1EFE7',
            border: '#E6DECF',
            textStrong: '#1F1A14',
            textMuted: '#746A5E',
            textSoft: '#8E7A63',
            buttonSecondaryBg: '#FFFFFF',
            buttonSecondaryText: '#1F1A14',
            buttonPrimaryBg: '#111111',
            buttonPrimaryText: '#FFFFFF',
            buttonPrimaryBorder: '#111111',
            inputBg: '#FFFFFF',
            inputBorder: '#DDD2C1',
            inputFocus: '#8E7A63',
            error: '#B42318',
            info: '#746A5E'
          }
        : {
            page: 'rgb(10,10,10)',
            border: 'rgba(255,255,255,0.06)',
            textStrong: '#ECEADD',
            textMuted: 'rgba(236,234,221,0.64)',
            textSoft: 'rgba(236,234,221,0.4)',
            buttonSecondaryBg: 'rgba(255,255,255,0.03)',
            buttonSecondaryText: '#ECEADD',
            buttonPrimaryBg: '#ECEADD',
            buttonPrimaryText: '#111111',
            buttonPrimaryBorder: 'transparent',
            inputBg: 'rgba(255,255,255,0.02)',
            inputBorder: 'rgba(255,255,255,0.08)',
            inputFocus: 'rgba(236,234,221,0.2)',
            error: '#FF9086',
            info: 'rgba(236,234,221,0.64)'
          };
      var pageBg = 'var(--site-nav-page-bg,' + palette.page + ')';
      var navOffset = 'var(--site-nav-offset, 48px)';

      return '<style>'
        + 'html,body{background:' + pageBg + '!important;color:' + palette.textStrong + '}'
        + '#' + GATE_ID + '{position:relative;z-index:5;background:' + pageBg + ';min-height:100vh}'
        + '#' + GATE_ID + ' *{box-sizing:border-box}'
        + '.ig-auth-shell{min-height:100vh;padding:calc(32px + ' + navOffset + ') 24px 48px;display:flex;align-items:center;justify-content:center;background:transparent}'
        + '.ig-auth-stack{width:min(100%,720px);background:transparent}'
        + '.ig-auth-form-title{margin:0 0 10px;font:600 34px/1.05 Inter,system-ui,sans-serif;letter-spacing:-0.038em;color:' + palette.textStrong + '}'
        + '.ig-auth-form-copy{margin:0 0 26px;font:400 16px/1.6 Inter,system-ui,sans-serif;color:' + palette.textMuted + ';max-width:40rem}'
        + '.ig-auth-btn,.ig-auth-input{width:100%;height:46px;border-radius:16px;border:1px solid ' + palette.inputBorder + ';background:' + palette.inputBg + ';color:' + palette.textStrong + ';font:500 14px Inter,system-ui,sans-serif}'
        + '.ig-auth-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;transition:transform .18s ease,background-color .18s ease,border-color .18s ease,opacity .18s ease}'
        + '.ig-auth-btn:hover{transform:translateY(-1px)}'
        + '.ig-auth-btn:disabled,.ig-auth-input:disabled{cursor:default;opacity:.72;transform:none}'
        + '.ig-auth-btn-secondary{background:' + palette.buttonSecondaryBg + ';color:' + palette.buttonSecondaryText + ';border-color:' + palette.border + '}'
        + '.ig-auth-btn-primary{margin-top:18px;height:50px;border-radius:18px;background:' + palette.buttonPrimaryBg + ';color:' + palette.buttonPrimaryText + ';border-color:' + palette.buttonPrimaryBorder + ';font-weight:700;font-size:15px}'
        + '.ig-auth-sep{position:relative;margin:18px 0 14px;text-align:center;font:600 11px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:' + palette.textSoft + '}'
        + '.ig-auth-sep:before{content:"";position:absolute;left:0;right:0;top:50%;border-top:1px solid ' + palette.border + '}'
        + '.ig-auth-sep span{position:relative;display:inline-block;padding:0 10px;background:' + pageBg + '}'
        + '.ig-auth-fields{display:grid;gap:10px}'
        + '.ig-auth-input{padding:0 15px;outline:none;transition:border-color .18s ease,box-shadow .18s ease,background-color .18s ease}'
        + '.ig-auth-input::placeholder{color:' + palette.textSoft + '}'
        + '.ig-auth-input:focus{border-color:' + palette.inputFocus + ';box-shadow:0 0 0 4px ' + (lightTheme ? 'rgba(142,122,99,0.12)' : 'rgba(236,234,221,0.08)') + '}'
        + '.ig-auth-footer{margin-top:14px;text-align:center;font:500 14px/1.5 Inter,system-ui,sans-serif;color:' + palette.textMuted + '}'
        + '.ig-auth-footer button{background:none;border:none;color:' + palette.textStrong + ';cursor:pointer;font:inherit;font-weight:600;padding:0}'
        + '.ig-auth-error{margin:12px 2px 0;font:500 12px/1.5 Inter,system-ui,sans-serif;color:' + palette.error + '}'
        + '.ig-auth-error[data-tone="info"]{color:' + palette.info + '}'
        + '@media (max-width: 560px){.ig-auth-shell{padding:calc(24px + ' + navOffset + ') 16px 36px}.ig-auth-stack{width:min(100%,560px)}.ig-auth-form-title{font-size:28px}.ig-auth-form-copy{font-size:15px;margin-bottom:22px}.ig-auth-btn-primary{margin-top:16px}}'
        + '</style>';
    }

    function queueGateRefresh() {
      clearThemeRefreshTimer();
      themeRefreshTimer = window.setTimeout(function () {
        themeRefreshTimer = 0;
        if (!currentUser) {
          showSignInGate(true);
        }
      }, 40);
    }

    function prepareDashboardShell() {
      var gate = document.getElementById(GATE_ID);
      if (gate) gate.remove();
      var oldBanner = document.getElementById(MOUNT_ID);
      if (oldBanner) oldBanner.remove();
      var root = document.getElementById('root');
      if (root) {
        root.style.display = '';
        root.style.visibility = 'hidden';
        root.style.opacity = '0';
        root.style.transition = 'opacity 240ms ease';
      }
      if (document.body && document.body.dataset) delete document.body.dataset.authPending;
      clearThemeRefreshTimer();
      dashboardPrepared = true;
    }

    function finalizeDashboardReveal() {
      if (revealQueued) return;
      revealQueued = true;
      clearDashboardRevealTimer();

      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          var root = document.getElementById('root');
          if (root) {
            root.style.visibility = '';
            root.style.opacity = '1';
          }

          revealQueued = false;
          dispatchProfileReady('dashboard');

          window.setTimeout(function () {
            if (!root) return;
            root.style.removeProperty('transition');
            root.style.removeProperty('opacity');
            root.style.removeProperty('visibility');
          }, 280);

          setTimeout(function() {
            try {
              window.dispatchEvent(new CustomEvent('igcsefy:data-change', {
                detail: { reason: 'auth-dashboard-nudge' }
              }));
            } catch(e) {}
          }, 100);
        });
      });
    }

    function maybeRevealDashboard() {
      profileDataReady = profileDataReady || hasRequiredProfilePatchSteps();

      if (!currentUser) return;
      if (!dashboardPrepared) return;
      if (!remoteSnapshotReady) return;
      if (!profileUserReady) return;
      if (!profileDataReady) return;
      finalizeDashboardReveal();
    }

    function startDashboardRevealFallback() {
      clearDashboardRevealTimer();
      dashboardRevealTimer = window.setTimeout(function () {
        remoteSnapshotReady = true;
        profileUserReady = true;
        profileDataReady = true;
        maybeRevealDashboard();
      }, 3200);
    }

    function showDashboard() {
      remoteSnapshotReady = false;
      profileUserReady = false;
      profileDataReady = hasRequiredProfilePatchSteps();
      lastProfileViewState = 'dashboard';
      prepareDashboardShell();
      startDashboardRevealFallback();

      if (window.igcsefyUser &&
          typeof window.igcsefyUser.get === 'function' &&
          window.igcsefyUser.get()) {
        window.setTimeout(function () {
          if (!profileUserReady) {
            profileUserReady = true;
            maybeRevealDashboard();
          }
        }, 140);
      }
    }

    function resetSignInView(root) {
      if (!root) return;
      root.style.display = 'none';
      root.style.removeProperty('visibility');
      root.style.removeProperty('opacity');
      root.style.removeProperty('transition');
    }

    function showSignInGate(forceRefresh) {
      clearDashboardRevealTimer();
      revealQueued = false;
      dashboardPrepared = false;
      remoteSnapshotReady = true;
      profileUserReady = true;
      lastProfileViewState = 'signin';

      var root = document.getElementById('root');
      resetSignInView(root);

      if (document.body && document.body.dataset) delete document.body.dataset.authPending;
      var mount = document.getElementById(MOUNT_ID);
      if (mount) mount.remove();
      var existingGate = document.getElementById(GATE_ID);
      if (existingGate) {
        if (!forceRefresh) {
          dispatchProfileReady('signin');
          return;
        }
        existingGate.remove();
      }

      var lightTheme = isLightTheme();
      var googleIcon = buildGoogleIcon(lightTheme);
      var gateStyles = buildGateStyles(lightTheme);

      var gate = document.createElement('div');
      gate.id = GATE_ID;
      document.body.appendChild(gate);

      gate.innerHTML = gateStyles
        + '<div class="ig-auth-shell"><section class="ig-auth-stack">'
        + '<h2 class="ig-auth-form-title">Continue your account</h2>'
        + '<p class="ig-auth-form-copy">Sign in to view your profile dashboard and restore your synced progress.</p>'
        + '<button id="igcsefy-profile-google" type="button" class="ig-auth-btn ig-auth-btn-secondary">'
        + googleIcon
        + '<span>Continue with Google</span></button>'
        + '<div class="ig-auth-sep"><span>or sign in with email</span></div>'
        + '<div class="ig-auth-fields">'
        + '<input id="igcsefy-profile-email" class="ig-auth-input" type="email" placeholder="Email address" autocomplete="email">'
        + '<input id="igcsefy-profile-password" class="ig-auth-input" type="password" placeholder="Password" autocomplete="current-password">'
        + '</div>'
        + '<button id="igcsefy-profile-email-submit" type="button" class="ig-auth-btn ig-auth-btn-primary">Sign in</button>'
        + '<div class="ig-auth-footer"><span id="igcsefy-profile-auth-mode-copy">Don\'t have an account?</span> <button id="igcsefy-profile-auth-toggle" type="button">Sign up \u2192</button></div>'
        + '<div id="igcsefy-profile-auth-error" class="ig-auth-error" aria-live="polite" hidden></div>'
        + '</section></div>';

      var googleBtn  = gate.querySelector('#igcsefy-profile-google');
      var emailInput = gate.querySelector('#igcsefy-profile-email');
      var passInput  = gate.querySelector('#igcsefy-profile-password');
      var submitBtn  = gate.querySelector('#igcsefy-profile-email-submit');
      var toggleBtn  = gate.querySelector('#igcsefy-profile-auth-toggle');
      var toggleCopy = gate.querySelector('#igcsefy-profile-auth-mode-copy');
      var errorBox   = gate.querySelector('#igcsefy-profile-auth-error');
      var mode = 'signin';

      function showErr(msg, tone) {
        if (!errorBox) return;
        errorBox.hidden = !msg;
        errorBox.textContent = msg || '';
        if (tone) {
          errorBox.setAttribute('data-tone', tone);
        } else {
          errorBox.removeAttribute('data-tone');
        }
      }

      function setBusy(busy, label) {
        if (submitBtn) { submitBtn.disabled = !!busy; submitBtn.textContent = label || (mode === 'signup' ? 'Create account' : 'Sign in'); }
        if (googleBtn) googleBtn.disabled = !!busy;
        if (emailInput) emailInput.disabled = !!busy;
        if (passInput) passInput.disabled = !!busy;
      }

      function submitEmailAuth() {
        var email = emailInput ? emailInput.value.trim() : '';
        var pass  = passInput  ? passInput.value          : '';
        showErr('');
        if (!email || !pass) {
          showErr('Enter your email and password first.');
          return;
        }

        setBusy(true, mode === 'signup' ? 'Creating account\u2026' : 'Signing in\u2026');

        var authPromise = mode === 'signup'
          ? client.auth.signUp({ email: email, password: pass, options: { emailRedirectTo: new URL('/profile/', window.location.origin).href } })
          : client.auth.signInWithPassword({ email: email, password: pass });

        authPromise.then(function (res) {
          if (res.error) throw res.error;
          var user = res.data && (res.data.user || (res.data.session && res.data.session.user));
          if (user) {
            window.location.replace('/profile/');
            return;
          }
          showErr(
            mode === 'signup'
              ? 'Check your inbox to confirm your account, then sign in.'
              : 'Signed in. Redirecting\u2026',
            'info'
          );
        }).catch(function (err) {
          console.error(err);
          showErr(err && err.message ? err.message : 'Sign in could not be completed.');
        }).finally(function () {
          setBusy(false);
        });
      }

      if (toggleBtn) {
        toggleBtn.onclick = function () {
          mode = mode === 'signin' ? 'signup' : 'signin';
          if (submitBtn)  submitBtn.textContent  = mode === 'signup' ? 'Create account'           : 'Sign in';
          if (toggleCopy) toggleCopy.textContent = mode === 'signup' ? 'Already have an account?' : "Don't have an account?";
          toggleBtn.textContent = mode === 'signup' ? 'Sign in \u2192' : 'Sign up \u2192';
          showErr('');
        };
      }

      if (googleBtn) {
        googleBtn.onclick = function () {
          showErr('');
          setBusy(true);
          signInWithGoogle('/profile/').catch(function (err) {
            console.error(err);
            showErr(err && err.message ? err.message : 'Google sign in could not start.');
            setBusy(false);
          });
        };
      }

      if (submitBtn) {
        submitBtn.onclick = submitEmailAuth;
      }

      [emailInput, passInput].forEach(function (input) {
        if (!input) return;
        input.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          submitEmailAuth();
        });
      });

      if (emailInput) {
        window.requestAnimationFrame(function () {
          try { emailInput.focus(); } catch (focusError) {}
        });
      }

      dispatchProfileReady('signin');
    }

    function syncProfileView(forceRefresh) {
      var nextState = currentUser ? 'dashboard' : 'signin';
      var bodyPending = !!(document.body && document.body.dataset && document.body.dataset.authPending);
      var gateVisible = !!document.getElementById(GATE_ID);

      if (!forceRefresh && lastProfileViewState === nextState) {
        if (nextState === 'dashboard' && !bodyPending && !gateVisible) {
          return;
        }

        if (nextState === 'signin' && gateVisible) {
          return;
        }
      }

      if (nextState === 'dashboard') {
        showDashboard();
        return;
      }

      showSignInGate(!!forceRefresh);
    }

    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!btn) return;
      if ((btn.textContent || '').trim().toLowerCase() === 'sign out') {
        e.stopImmediatePropagation();
        e.preventDefault();
        signOut().finally(function () { window.location.reload(); });
      }
    }, true);

    window.addEventListener('igcsefy:data-change', function (event) {
      var reason = event && event.detail ? event.detail.reason : '';
      if (!currentUser) return;
      if (reason === 'remote-load' || reason === 'remote-update') {
        remoteSnapshotReady = true;
        maybeRevealDashboard();
      }
    });

    window.addEventListener(PROFILE_USER_READY_EVENT, function () {
      if (!currentUser) return;
      profileUserReady = true;
      maybeRevealDashboard();
    });

    window.addEventListener(PROFILE_PATCH_READY_EVENT, function () {
      if (!currentUser) return;
      if (hasRequiredProfilePatchSteps()) {
        profileDataReady = true;
        maybeRevealDashboard();
      }
    });

    window.addEventListener(AUTH_EVENT, function (event) {
      var authEventType = event && event.detail ? String(event.detail.event || '') : '';

      if (authEventType === 'TOKEN_REFRESHED' || authEventType === 'USER_UPDATED') {
        return;
      }

      syncProfileView(false);
    });
    window.addEventListener('igcsefy:theme-change', queueGateRefresh);

    authReady.then(function () {
      syncProfileView(false);
    });
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────
  handleSignInPage();
  handleProfilePage();

})();
