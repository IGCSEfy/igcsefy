
function ensureIgcsefyDataStore(){
  if(typeof window === 'undefined'){
    return {
      getSnapshot(){ return {}; },
      getRequestedLevel(){ return ''; },
      getSubjectLevel(_subject, fallback){ return fallback || 'core'; },
      setSubjectLevel(){ return {}; },
      setTrackedSubjects(){ return {}; },
      getSyllabusStates(){ return {}; },
      setSyllabusStates(){ return {}; },
      getSyllabusState(){ return 'not_started'; },
      setSyllabusState(){ return {}; },
      getPastPaperStatuses(){ return {}; },
      setPastPaperStatuses(){ return {}; },
      getPastPaperStatus(){ return 'none'; },
      setPastPaperStatus(){ return {}; },
      replaceSnapshot(){ return {}; }
    };
  }

  if(window.igcsefyDataStore){
    return window.igcsefyDataStore;
  }

  const CHANGE_EVENT = 'igcsefy:data-change';
  const ADAPTER_READY_EVENT = 'igcsefy:data-adapter-ready';
  const LEVELS = new Set(['core', 'extended']);
  const SYLLABUS_STATES = new Set(['in_progress', 'completed']);
  const PAST_PAPER_STATES = new Set(['in_progress', 'done', 'reviewed']);

  let snapshot = createEmptySnapshot();
  let remoteSaveTimer = 0;
  let remoteLoadStarted = false;
  let remoteSubscribed = false;

  function clone(value){
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(error){
      return value;
    }
  }

  function cleanRecord(record, allowedValues){
    const next = {};
    if(!record || typeof record !== 'object' || Array.isArray(record)) return next;
    Object.keys(record).forEach(key => {
      const value = record[key];
      if(allowedValues.has(value)){
        next[String(key)] = value;
      }
    });
    return next;
  }

  function normalizeTrackedSubjects(subjects){
    if(!Array.isArray(subjects)) return [];

    const seen = new Set();
    return subjects.map(subject => {
      const code = String(subject && subject.code ? subject.code : '').trim();
      const slug = String(subject && subject.slug ? subject.slug : '').trim();
      const name = String(subject && subject.name ? subject.name : code || slug).trim();
      const key = slug || code;

      if(!key || seen.has(key)) return null;
      seen.add(key);

      const entry = {
        code,
        slug,
        name: name || code || slug
      };

      if(subject && subject.hasDistinctLevels){
        entry.hasDistinctLevels = true;
      }

      if(subject && LEVELS.has(subject.level)){
        entry.level = subject.level;
      }

      return entry;
    }).filter(Boolean);
  }

  function normalizeSubjectPreferences(preferences){
    const next = {};
    if(!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return next;

    Object.keys(preferences).forEach(key => {
      const value = preferences[key];
      if(!value || typeof value !== 'object' || !LEVELS.has(value.level)) return;
      next[String(key)] = {
        level: value.level,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
      };
    });

    return next;
  }

  function normaliseSnapshot(input){
    if(!input || typeof input !== 'object' || Array.isArray(input)){
      return createEmptySnapshot();
    }

    return {
      trackedSubjects: normalizeTrackedSubjects(input.trackedSubjects),
      subjectPreferences: normalizeSubjectPreferences(input.subjectPreferences),
      syllabusTopicStates: cleanRecord(input.syllabusTopicStates, SYLLABUS_STATES),
      pastPaperStatuses: cleanRecord(input.pastPaperStatuses, PAST_PAPER_STATES),
      updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null
    };
  }

  function createEmptySnapshot(){
    return {
      trackedSubjects: [],
      subjectPreferences: {},
      syllabusTopicStates: {},
      pastPaperStatuses: {},
      updatedAt: null
    };
  }

  function serialiseSnapshot(input){
    const normalized = normaliseSnapshot(input);
    normalized.updatedAt = null;
    return JSON.stringify(normalized);
  }

  function emitStoreChange(reason, meta){
    try{
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
        detail: {
          reason,
          meta: meta || null,
          snapshot: clone(snapshot)
        }
      }));
    }catch(error){}
  }

  function resolveAdapter(){
    return window.igcsefyDataStoreAdapter || null;
  }

  function scheduleRemoteSave(reason){
    const adapter = resolveAdapter();
    if(!adapter || typeof adapter.save !== 'function') return;

    if(remoteSaveTimer){
      window.clearTimeout(remoteSaveTimer);
    }

    remoteSaveTimer = window.setTimeout(async () => {
      try{
        await adapter.save(clone(snapshot), { reason });
      }catch(error){
        console.error('IGCSEfy data sync failed:', error);
      }
    }, 160);
  }

  function setSnapshot(nextSnapshot, reason, options){
    const normalized = normaliseSnapshot(nextSnapshot);
    const currentSerialised = serialiseSnapshot(snapshot);
    const nextSerialised = serialiseSnapshot(normalized);

    if(currentSerialised === nextSerialised){
      return clone(snapshot);
    }

    snapshot = normalized;
    snapshot.updatedAt = new Date().toISOString();
    emitStoreChange(reason, options && options.meta);

    if(!(options && options.skipRemote)){
      scheduleRemoteSave(reason);
    }

    return clone(snapshot);
  }

  function updateSnapshot(mutator, reason, options){
    const draft = clone(snapshot);
    mutator(draft);
    return setSnapshot(draft, reason, options);
  }

  function getSubjectKey(subject){
    if(subject && typeof subject === 'object'){
      const slug = String(subject.slug || subject.subjectSlug || '').trim();
      if(slug) return slug;
      const code = String(subject.code || '').trim();
      if(code) return code;
    }
    return String(subject || '').trim();
  }

  function getSubjectPreferenceKeys(subject){
    const keys = [];
    if(subject && typeof subject === 'object'){
      const slug = String(subject.slug || subject.subjectSlug || '').trim();
      const code = String(subject.code || '').trim();
      if(slug) keys.push(slug);
      if(code && !keys.includes(code)) keys.push(code);
      return keys;
    }
    const value = String(subject || '').trim();
    return value ? [value] : [];
  }

  function getStoredSubjectPreference(subjectPreferences, subject){
    const keys = getSubjectPreferenceKeys(subject);
    for(const key of keys){
      const preferred = subjectPreferences[key];
      if(preferred && LEVELS.has(preferred.level)){
        return preferred;
      }
    }
    return null;
  }

  function applyTrackedSubjectPreferences(subjects, subjectPreferences){
    return normalizeTrackedSubjects(subjects).map(subject => {
      const preferred = getStoredSubjectPreference(subjectPreferences, subject);
      if(preferred){
        return Object.assign({}, subject, { level: preferred.level });
      }
      return subject;
    });
  }

  function getRequestedLevel(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      const value = String(params.get('level') || '').toLowerCase().trim();
      return LEVELS.has(value) ? value : '';
    }catch(error){
      return '';
    }
  }

  function initRemote(){
    const adapter = resolveAdapter();
    if(!adapter) return;

    if(!remoteLoadStarted && typeof adapter.load === 'function'){
      remoteLoadStarted = true;
      Promise.resolve(adapter.load())
        .then(remoteSnapshot => {
          if(remoteSnapshot){
            applyRemoteSnapshot(remoteSnapshot, 'remote-load');
          }
        })
        .catch(error => {
          remoteLoadStarted = false;
          console.error('IGCSEfy remote load failed:', error);
        });
    }

    if(!remoteSubscribed && typeof adapter.subscribe === 'function'){
      remoteSubscribed = true;
      try{
        adapter.subscribe(remoteSnapshot => {
          if(remoteSnapshot){
            applyRemoteSnapshot(remoteSnapshot, 'remote-update');
          }
        });
      }catch(error){
        remoteSubscribed = false;
        console.error('IGCSEFy remote subscription failed:', error);
      }
    }
  }

  window.addEventListener(ADAPTER_READY_EVENT, initRemote);

  const api = {
    getSnapshot(){
      initRemote();
      return clone(snapshot);
    },
    getRequestedLevel,
    getSubjectLevel(subject, fallback){
      initRemote();
      const requestedLevel = getRequestedLevel();
      if(requestedLevel) return requestedLevel;

      const preferred = getStoredSubjectPreference(snapshot.subjectPreferences, subject);
      return preferred ? preferred.level : (fallback || 'core');
    },
    replaceSnapshot(nextSnapshot, reason, options){
      return applyRemoteSnapshot(nextSnapshot, reason || 'remote-update', options);
    },
    setSubjectLevel(subject, level){
      if(!LEVELS.has(level)) return clone(snapshot);
      const keys = getSubjectPreferenceKeys(subject);
      if(!keys.length) return clone(snapshot);

      const existing = getStoredSubjectPreference(snapshot.subjectPreferences, subject);
      if(existing && existing.level === level){
        return clone(snapshot);
      }

      return updateSnapshot(draft => {
        const updatedAt = new Date().toISOString();
        keys.forEach(key => {
          draft.subjectPreferences[key] = { level, updatedAt };
        });
        draft.trackedSubjects = draft.trackedSubjects.map(item => {
          const itemKeys = getSubjectPreferenceKeys(item);
          return itemKeys.some(key => keys.includes(key)) ? Object.assign({}, item, { level }) : item;
        });
      }, 'subject-level', { meta: { subjectKey: keys[0], level } });
    },
    setTrackedSubjects(subjects){
      const normalizedSubjects = applyTrackedSubjectPreferences(subjects, snapshot.subjectPreferences);

      return updateSnapshot(draft => {
        draft.trackedSubjects = normalizedSubjects;
        const allowedKeys = new Set();
        normalizedSubjects.forEach(subject => {
          getSubjectPreferenceKeys(subject).forEach(key => allowedKeys.add(key));
        });
        Object.keys(draft.subjectPreferences).forEach(key => {
          if(!allowedKeys.has(key)){
            delete draft.subjectPreferences[key];
          }
        });
      }, 'tracked-subjects', { meta: { total: normalizedSubjects.length } });
    },
    getSyllabusStates(){
      initRemote();
      return Object.assign({}, snapshot.syllabusTopicStates);
    },
    setSyllabusStates(nextStates){
      return updateSnapshot(draft => {
        draft.syllabusTopicStates = cleanRecord(nextStates, SYLLABUS_STATES);
      }, 'syllabus-states');
    },
    getSyllabusState(topicKey){
      initRemote();
      return snapshot.syllabusTopicStates[topicKey] || 'not_started';
    },
    setSyllabusState(topicKey, state){
      const key = String(topicKey || '').trim();
      if(!key) return clone(snapshot);

      return updateSnapshot(draft => {
        if(!SYLLABUS_STATES.has(state)){
          delete draft.syllabusTopicStates[key];
          return;
        }
        draft.syllabusTopicStates[key] = state;
      }, 'syllabus-topic', { meta: { topicKey: key, state: state || 'not_started' } });
    },
    getPastPaperStatuses(){
      initRemote();
      return Object.assign({}, snapshot.pastPaperStatuses);
    },
    setPastPaperStatuses(nextStatuses){
      const normalizedStatuses = cleanRecord(nextStatuses, PAST_PAPER_STATES);
      const nextSnapshot = updateSnapshot(draft => {
        draft.pastPaperStatuses = normalizedStatuses;
      }, 'past-paper-statuses', { meta: { total: Object.keys(normalizedStatuses).length } });

      try{
        window.dispatchEvent(new CustomEvent('igcsefy:tracker-change', {
          detail: {
            store: Object.assign({}, nextSnapshot.pastPaperStatuses || {})
          }
        }));
      }catch(error){}

      return nextSnapshot;
    },
    getPastPaperStatus(trackKey){
      initRemote();
      return snapshot.pastPaperStatuses[trackKey] || 'none';
    },
    setPastPaperStatus(trackKey, status){
      const key = String(trackKey || '').trim();
      if(!key) return clone(snapshot);

      const nextSnapshot = updateSnapshot(draft => {
        if(!PAST_PAPER_STATES.has(status)){
          delete draft.pastPaperStatuses[key];
          return;
        }
        draft.pastPaperStatuses[key] = status;
      }, 'past-paper-status', { meta: { trackKey: key, status: status || 'none' } });

      try{
        window.dispatchEvent(new CustomEvent('igcsefy:tracker-change', {
          detail: {
            store: Object.assign({}, nextSnapshot.pastPaperStatuses || {})
          }
        }));
      }catch(error){}

      return nextSnapshot;
    }
  };

  function applyRemoteSnapshot(remoteSnapshot, reason, options){
    if(!remoteSnapshot){
      return clone(snapshot);
    }

    const normalized = normaliseSnapshot(remoteSnapshot);
    const subjectPreferences = normalizeSubjectPreferences(normalized.subjectPreferences);

    return setSnapshot({
      trackedSubjects: applyTrackedSubjectPreferences(normalized.trackedSubjects, subjectPreferences),
      subjectPreferences,
      syllabusTopicStates: Object.assign({}, normalized.syllabusTopicStates),
      pastPaperStatuses: Object.assign({}, normalized.pastPaperStatuses),
      updatedAt: normalized.updatedAt || null
    }, reason, { skipRemote: true });
  }

  window.igcsefyDataStore = api;
  initRemote();
  return api;
}

function isLightThemeActive(){
  if(typeof document === 'undefined') return false;
  const root = document.documentElement;
  return root.dataset.theme === 'light'
    || root.classList.contains('light')
    || (!root.classList.contains('dark') && root.dataset.theme !== 'dark');
}

/* Lightweight global scroll/hover polish (kept tiny for low-end devices) */
function initGlobalMotion(){
  document.documentElement.classList.add('js');

  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = (navigator.connection && navigator.connection.saveData) ? true : false;
  if(prefersReduced || saveData) return;

  /* Scroll reveal (IntersectionObserver) */
  if(!('IntersectionObserver' in window)) return;
  const targets = document.querySelectorAll([
    '.card',
    '.subject-card',
    '.pp-series-card',
    '.pp-year-panel',
    '.accordion .ac-item',
    '.syll-grid',
    '.ai-frame',
    '.about-section',
    '.about-panel',
    '.about-card'
  ].join(','));

  if(!targets.length) return;

  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add('io-in');
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

  targets.forEach(el=>{
    // avoid double-applying
    if(el.classList.contains('io')) return;
    el.classList.add('io');
    io.observe(el);
  });
}

function initTabs(){
  document.querySelectorAll('[role="tablist"]').forEach(list=>{
    const tabs = list.querySelectorAll('[role="tab"]');
    tabs.forEach(tab=>{
      tab.addEventListener('click',()=>{
        const root = tab.closest('[data-tabs]');
        if(!root) return;
        setActiveSubjectTab(root, tab.getAttribute('aria-controls'));
      });
    });
  });
}

function formatSubjectNameFromSlug(slug){
  if(!slug) return '';
  const smallWords = new Set(['as', 'a', 'and', 'of', 'the', 'to', 'in']);
  return String(slug)
    .split('-')
    .filter(Boolean)
    .filter(part => !/^\d+$/.test(part))
    .map((part, idx) => {
      const lower = part.toLowerCase();
      if(idx > 0 && smallWords.has(lower)) return lower;
      if(lower.length <= 3 && /^[a-z]+$/.test(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .trim();
}

function extractSubjectMeta(data, containerId, jsonPath, containerEl){
  const heroTitle = (document.querySelector('main .hero h1') && document.querySelector('main .hero h1').textContent) ? document.querySelector('main .hero h1').textContent.trim() : '';
  const rawTitle = data && data.title ? String(data.title) : heroTitle;
  const patterns = [
    /Cambridge\s+IGCSE\s+(.+?)\s*\((\d{4})\)/i,
    /Cambridge\s*[–-]\s*(.+?)\s*\((\d{4})\)/i,
    /^(.+?)\s*\((\d{4})\)/
  ];

  let name = '';
  let code = '';

  patterns.some(pattern => {
    const match = rawTitle.match(pattern);
    if(!match) return false;
    name = (match[1] || '').trim();
    code = (match[2] || '').trim();
    return true;
  });

  if(!name || !code){
    const fallback = heroTitle.match(/(.+?)\s*\((\d{4})\)/);
    if(fallback){
      name = fallback[1].replace(/^Cambridge\s*[–-]\s*/i, '').trim();
      code = fallback[2];
    }
  }

  let slug = '';

  if(!name || !code){
    const slugFromId = String(containerId || '').replace(/^syllabus-/, '');
    const slugFromPath = (String(jsonPath || '').match(/resources\/([^/]+)\//) || [])[1] || '';
    slug = slugFromId || slugFromPath;
    if(!name) name = formatSubjectNameFromSlug(slug);
    if(!code){
      const codeMatch = slug.match(/(\d{4})$/);
      code = codeMatch ? codeMatch[1] : '';
    }
  }

  if(!slug){
    slug = String(containerId || '').replace(/^syllabus-/, '') || ((String(jsonPath || '').match(/resources\/([^/]+)\//) || [])[1] || '');
  }

  if(!name && containerEl){
    name = containerEl.getAttribute('data-subject-name') || '';
  }

  return {
    name: name || 'Subject',
    code: code || '',
    slug: slug || ''
  };
}

function cleanSyllabusTitle(title, fallbackLabel){
  const raw = String(title || fallbackLabel || '').trim()
    .replace(/^[•–—-]\s*/, '')
    .replace(/^([A-Z])(?=\d+(?:\.\d+)*\b)/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return raw || fallbackLabel;
}

function parseSyllabusHeading(title, fallbackLabel){
  const cleaned = cleanSyllabusTitle(title, fallbackLabel);
  const match = cleaned.match(/^(\d+(?:\.\d+)*)\.?\s*(.*)$/);
  if(!match){
    return {
      code: '',
      label: cleaned
    };
  }
  return {
    code: match[1],
    label: (match[2] || '').trim() || match[1]
  };
}

function stripSyllabusSectionPrefix(title, fallbackLabel){
  const cleaned = cleanSyllabusTitle(title, fallbackLabel);
  const match = cleaned.match(/^\d+\.?\s+(.*)$/);
  return match ? ((match[1] || '').trim() || cleaned) : cleaned;
}

function normalizeSyllabusTitle(title, fallbackLabel){
  return cleanSyllabusTitle(title, fallbackLabel);
}

function normalizeSyllabusSubtopicText(text){
  return String(text || '')
    .replace(/^[•–—-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const SYLLABUS_POINT_PREFIX_PATTERNS = [
  /^Describe and compare the structure of\s+/i,
  /^Describe and compare\s+/i,
  /^Describe and explain the\s+/i,
  /^Sketch,\s*plot and interpret\s+/i,
  /^Sketch and interpret\s+/i,
  /^Draw and label\s+/i,
  /^Draw and interpret\s+/i,
  /^Draw and use\s+/i,
  /^Investigate and describe\s+/i,
  /^Recall and use the equations for\s+/i,
  /^Recall and use the equation for\s+/i,
  /^Recall and use the equations?\s+/i,
  /^State and use the formula:\s*/i,
  /^State and use\s+/i,
  /^State and use the terms?\s+/i,
  /^State and explain\s+/i,
  /^Define and use the terms\s+/i,
  /^Define and use the term\s+/i,
  /^Describe an experiment to\s+/i,
  /^Describe experiments to\s+/i,
  /^Describe and draw the structure of\s+/i,
  /^Describe and draw\s+/i,
  /^Describe,\s*and use the concept of,\s*/i,
  /^Describe,\s*qualitatively,\s*/i,
  /^Describe in terms of\s+/i,
  /^Describe how to\s+/i,
  /^Describe how\s+/i,
  /^Describe:\s*/i,
  /^Determine,\s*by calculation or graphically,\s*the\s+/i,
  /^Draw the\s+/i,
  /^Draw\s+/i,
  /^Describe what is meant by\s+/i,
  /^Describe a:\s*/i,
  /^Describe the functions of\s+/i,
  /^Describe the function of\s+/i,
  /^Describe the structure of\s+/i,
  /^Describe the use of\s+/i,
  /^Describe the role of\s+/i,
  /^Describe the effect of changes in\s+/i,
  /^Describe the effect of\s+/i,
  /^Describe the effects of\s+/i,
  /^Describe the pattern and direction of\s+/i,
  /^Describe the position of\s+/i,
  /^Describe the principle of\s+/i,
  /^Describe the production of\s+/i,
  /^Describe the formation of\s+/i,
  /^Describe the action of\s+/i,
  /^Describe the passage of\s+/i,
  /^Describe the relationship between\s+/i,
  /^Describe the particle structure of\s+/i,
  /^Describe the dispersion of\s+/i,
  /^Describe the properties of\s+/i,
  /^Describe the differences between\s+/i,
  /^Describe the characteristic properties of\s+/i,
  /^Describe the characteristics of\s+/i,
  /^Describe\s+/i,
  /^Describe the /i,
  /^State,\s*qualitatively,\s*the relationship of\s+/i,
  /^State,\s*qualitatively,\s*/i,
  /^State what is meant by\s+/i,
  /^State that,\s*/i,
  /^State that\s+/i,
  /^State the\s+/i,
  /^Know that\s+/i,
  /^Know the\s+/i,
  /^Understand,\s*qualitatively,\s*the concept of\s+/i,
  /^Understand that\s+/i,
  /^Understand the\s+/i,
  /^Define the\s+/i,
  /^Define\s+/i,
  /^Explain the use and operation of\s+/i,
  /^Explain how and why\s+/i,
  /^Explain how\s+/i,
  /^Explain why\s+/i,
  /^Explain in terms of\s+/i,
  /^Explain the effect of changes in\s+/i,
  /^Explain the effect of\s+/i,
  /^Explain the\s+/i,
  /^Explain\s+/i,
  /^How the\s+/i,
  /^How\s+/i,
  /^Apply the principle of\s+/i,
  /^Apply\s+/i,
  /^Analyse and interpret\s+/i,
  /^Analyse\s+/i,
  /^Interpret and use\s+/i,
  /^Use the relationship\s+/i,
  /^Use the molar gas volume,\s*taken as .*?,\s*in calculations involving\s+/i,
  /^Use a Roman numeral to indicate\s+/i,
  /^Use experimental data from\s+/i,
  /^Use\s+/i,
  /^Identify and explain\s+/i,
  /^Identify in diagrams and images and\s+/i,
  /^Identify in diagrams and images\s+/i,
  /^In diagrams and images and\s+/i,
  /^In diagrams and images of\s+/i,
  /^In diagrams and images\s+/i,
  /^On diagrams and\s+/i,
  /^On diagrams\s+/i,
  /^Following structures in\s+/i,
  /^Following parts of\s+/i,
  /^Identify in diagrams and images the\s+/i,
  /^Identify on diagrams and images the\s+/i,
  /^Identify on diagrams and images\s+/i,
  /^Identify the\s+/i,
  /^Identify\s+/i,
  /^Interpret\s+/i,
  /^Determine whether\s+/i,
  /^Determine,\s*qualitatively,\s*/i,
  /^Determine\s+/i,
  /^Calculate\s+/i,
  /^Discuss\s+/i,
  /^Evaluate\s+/i,
  /^Give\s+/i,
  /^Label\s+/i,
  /^List the\s+/i,
  /^List\s+/i,
  /^Outline the role of\s+/i,
  /^Outline the structure and function of\s+/i,
  /^Outline\s+/i,
  /^Investigate\s+/i,
  /^Write and interpret\s+/i,
  /^Write\s+/i,
  /^Show\s+/i,
  /^Demonstrate\s+/i,
  /^Distinguish between\s+/i,
  /^Distinguish\s+/i,
  /^Relate the structure of\s+/i,
  /^Relate\s+/i,
  /^Construct and use\s+/i,
  /^Construct\s+/i,
  /^Know that,\s*/i,
  /^Know what happens to\s+/i,
  /^Why the\s+/i,
  /^Select\s+/i,
  /^Classify\s+/i,
  /^Predict\s+/i,
  /^Deduce\s+/i,
  /^Suggest suitable\s+/i,
  /^Suggest\s+/i,
  /^Suggest advantages and disadvantages of\s+/i,
  /^Name\s+/i
];

function splitEmbeddedSyllabusSubtopics(values){
  if(!Array.isArray(values)) return [];
  const output = [];
  values.forEach((entry) => {
    let value = normalizeSyllabusSubtopicText(entry);
    while(value){
      const match = value.match(/^(.*?)(?:\s+)(\d+\.\d+\.\d+(?:\.\d+)?\s+[A-Z(].*)$/);
      if(!match) break;
      if(match[1] && match[1].trim()){
        output.push(match[1].trim());
      }
      value = String(match[2] || '').trim();
    }
    if(value){
      output.push(value);
    }
  });
  return output;
}

function formatSyllabusLabel(value){
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;:])/g, '$1')
    .replace(/\s+\)$/g, ')')
    .replace(/\(\s+/g, '(')
    .trim()
    .replace(/[;:,.]+$/, '')
    .replace(/^,\s*/, '')
    .replace(/^and\s+/i, '')
    .replace(/^compare\s+/i, '')
    .replace(/^that\s+/i, '')
    .replace(/^(?:a|an|the)\s+/i, '');

  if(!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const SYLLABUS_COMMAND_WORD_PATTERN = /\b(?:state|describe|explain|relate|recall|know|determine|show|calculate|give|outline|identify|use|apply|investigate|select|classify|suggest|interpret|construct|plot|sketch|deduce|predict|compare|discuss|define|understand|demonstrate|list|name)\b/i;

const SYLLABUS_CONCEPT_LABEL_RULES = [
  [/^speed as distance travelled per unit time(?:;.*)?$/i, 'Speed'],
  [/^velocity as speed in a given direction$/i, 'Velocity'],
  [/^average speed$/i, 'Average speed'],
  [/^distance[–-]time graph(?:s)? or speed[–-]time graph(?:s)?$/i, 'Distance-time and speed-time graphs'],
  [/^distance[–-]time and speed[–-]time graphs$/i, 'Distance-time and speed-time graphs'],
  [/^gradient of a straight- line section of a distance[–-]time graph$/i, 'Gradient of a distance-time graph'],
  [/^area under a speed[–-]time graph(?: to determine.*)?$/i, 'Area under a speed-time graph'],
  [/^acceleration as change in velocity per unit time(?:;.*)?$/i, 'Acceleration'],
  [/^gradient of a speed[–-]time graph.*$/i, 'Gradient of a speed-time graph'],
  [/^resultant of two vectors at right angles$/i, 'Resultant vectors at right angles'],
  [/^gravitational field strength as force per unit mass(?:;.*)?$/i, 'Gravitational field strength'],
  [/^density of a liquid, of a regularly shaped solid and of an irregularly shaped solid$/i, 'Density'],
  [/^density as mass per unit volume(?:;.*)?$/i, 'Density'],
  [/^determine the density of a liquid, of a regularly shaped solid and of an irregularly shaped solid$/i, 'Density measurements'],
  [/^density of a liquid, of a regularly shaped solid and of an irregularly shaped solid$/i, 'Density measurements'],
  [/^one liquid will float on another liquid.*$/i, 'Floating and density'],
  [/^spring constant as force per unit extension(?:;.*)?$/i, 'Spring constant'],
  [/^motion in a circular path due to a force perpendicular to the motion.*$/i, 'Circular motion'],
  [/^momentum as mass × velocity(?:;.*)?$/i, 'Momentum'],
  [/^impulse as force × time.*$/i, 'Impulse'],
  [/^conservation of momentum/i, 'Conservation of momentum'],
  [/^resultant force as the change in momentum per unit time(?:;.*)?$/i, 'Force and rate of change of momentum'],
  [/^pressure as force per unit area(?:;.*)?$/i, 'Pressure'],
  [/^pressure varies with force and area$/i, 'Pressure, force and area'],
  [/^pressure varies with force and area.*$/i, 'Pressure, force and area'],
  [/^pressure beneath the surface of a liquid changes with depth and density of the liquid$/i, 'Pressure in liquids'],
  [/^how the pressure beneath the surface of a liquid changes with depth and density of the liquid$/i, 'Pressure in liquids'],
  [/^change in pressure beneath the surface of a liquid.*$/i, 'Pressure change in liquids'],
  [/^pressure and the changes in pressure of a gas$/i, 'Gas pressure'],
  [/^properties of solids, liquids and gases$/i, 'Properties of solids, liquids and gases'],
  [/^forces and distances between particles.*properties of solids, liquids and gases$/i, 'Particle forces and properties of matter'],
  [/^changes in state between solids, liquids and gases$/i, 'Changes of state'],
  [/^thermal expansion of solids, liquids and gases(?: at constant pressure)?$/i, 'Thermal expansion'],
  [/^pressure of a gas$/i, 'Gas pressure'],
  [/^specific heat capacity as the energy required per unit mass per unit temperature increase(?:;.*)?$/i, 'Specific heat capacity'],
  [/^measure the specific heat capacity of a solid and a liquid$/i, 'Measuring specific heat capacity'],
  [/^temperature, surface area and air movement over a surface affect evaporation$/i, 'Factors affecting evaporation'],
  [/^surface colour \(black or white\) and texture \(dull or shiny\) on the emission, absorption and reflection of infrared radiation$/i, 'Surface properties and infrared radiation'],
  [/^for an object to be at a constant temperature it needs to transfer energy away from the object at the same rate that it receives energy$/i, 'Thermal equilibrium'],
  [/^what happens to an object if the rate at.*$/i, 'Thermal equilibrium'],
  [/^melting and boiling temperatures for water(?: at standard atmospheric pressure)?$/i, 'Melting and boiling points of water'],
  [/^good thermal conductors and bad thermal conductors$/i, 'Thermal conductors and insulators'],
  [/^properties of good thermal conductors and bad thermal conductors.*$/i, 'Thermal conductors and insulators'],
  [/^thermal energy transfer by thermal radiation$/i, 'Thermal radiation transfer'],
  [/^thermal energy transfer by thermal radiation does not require a medium$/i, 'Thermal radiation transfer'],
  [/^good and bad emitters of infrared radiation$/i, 'Infrared emitters'],
  [/^good and bad emitters of infrared radiation.*$/i, 'Infrared emitters'],
  [/^good and bad absorbers of infrared radiation$/i, 'Infrared absorbers'],
  [/^good and bad absorbers of infrared radiation.*$/i, 'Infrared absorbers'],
  [/^rate of emission of radiation depends on the surface temperature and surface area$/i, 'Factors affecting radiation emission'],
  [/^applications and consequences of conduction, convection and radiation$/i, 'Applications of thermal energy transfer'],
  [/^some of the basic everyday applications and consequences of conduction, convection and radiation$/i, 'Applications of thermal energy transfer'],
  [/^some of the everyday applications and consequences of thermal expansion$/i, 'Applications of thermal expansion'],
  [/^some of the complex applications and consequences of conduction, convection and radiation$/i, 'Applications of thermal energy transfer'],
  [/^wave speed$/i, 'Wave speed'],
  [/^ripple tank to show$/i, 'Ripple tank wave behaviour'],
  [/^normal, angle of incidence and angle of reflection$/i, 'Angles of incidence and reflection'],
  [/^optical image by a plane mirror$/i, 'Plane mirror images'],
  [/^normal, angle of incidence and angle of refraction$/i, 'Angles of incidence and refraction'],
  [/^refraction of light by transparent blocks of different shapes$/i, 'Refraction experiments'],
  [/^refraction of light by transparent blocks of different shapes.*$/i, 'Refraction'],
  [/^thin converging and thin diverging lenses$/i, 'Converging and diverging lenses'],
  [/^thin converging and thin diverging lenses.*$/i, 'Converging and diverging lenses'],
  [/^focal length, principal axis and principal focus(?: \(focal point\))?$/i, 'Lens terms'],
  [/^ray diagrams for the formation of a real image by a converging lens$/i, 'Ray diagrams for converging lenses'],
  [/^simple constructions, measurements and calculations for reflection by plane mirrors$/i, 'Plane mirror construction'],
  [/^ray diagrams for the formation of a virtual image by a converging lens$/i, 'Virtual image ray diagrams'],
  [/^converging and diverging lenses to correct long-sightedness and short- sightedness$/i, 'Vision correction with lenses'],
  [/^traditional seven colours of the visible spectrum$/i, 'Visible spectrum colours'],
  [/^traditional seven colours of the visible spectrum.*$/i, 'Visible spectrum colours'],
  [/^main regions of the electromagnetic spectrum$/i, 'Electromagnetic spectrum order'],
  [/^main regions of the electromagnetic spectrum.*$/i, 'Electromagnetic spectrum order'],
  [/^all electromagnetic waves travel at the same high speed in a vacuum$/i, 'Speed of electromagnetic waves'],
  [/^approximate range of frequencies audible to humans$/i, 'Audible frequency range'],
  [/^changes in amplitude and frequency affect the loudness and pitch of sound waves$/i, 'Loudness and pitch'],
  [/^sound travels faster in solids than in liquids and faster in liquids than in gases$/i, 'Speed of sound in different media'],
  [/^uses of ultrasound in non- destructive testing of materials, medical scanning of soft tissue and sonar$/i, 'Uses of ultrasound'],
  [/^forces between magnetic poles and between magnets and magnetic materials$/i, 'Magnetic forces'],
  [/^differences between the properties of temporary magnets.*permanent magnets.*$/i, 'Temporary and permanent magnets'],
  [/^pattern and direction of magnetic field lines around a bar magnet$/i, 'Magnetic field lines'],
  [/^plotting of magnetic field lines with a compass or iron filings.*$/i, 'Magnetic field plotting'],
  [/^positive charges repel.*positive charges attract negative charges$/i, 'Attraction and repulsion of charges'],
  [/^production of electrostatic charges by friction.*detection of electrostatic charges$/i, 'Electrostatic charging'],
  [/^charging of solids by friction$/i, 'Charging by friction'],
  [/^charging of solids by friction.*$/i, 'Charging by friction'],
  [/^voltmeters .* different ranges$/i, 'Voltmeter ranges'],
  [/^resistance$/i, 'Resistance'],
  [/^relationship of the resistance of a metallic wire to its length and to its cross-sectional area$/i, 'Factors affecting resistance'],
  [/^resistance of a metallic wire to its length and to its cross-sectional area$/i, 'Factors affecting resistance'],
  [/^combined resistance of two or more resistors in series$/i, 'Combined resistance in series'],
  [/^advantages of connecting lamps in parallel in a lighting circuit$/i, 'Parallel lamp circuits'],
  [/^circuit diagrams containing .*$/i, 'Circuit diagram symbols'],
  [/^electric circuits transfer energy from a source of electrical energy$/i, 'Energy transfer in electric circuits'],
  [/^kilowatt-hour(?: \(kW h\))?$/i, 'Kilowatt-hour'],
  [/^hazards$/i, 'Electrical hazards'],
  [/^mains circuit consists of a live wire.*earth wire$/i, 'Mains wiring'],
  [/^trip switches and fuses$/i, 'Fuses and trip switches'],
  [/^outer casing of an electrical appliance.*double-insulated.*earthed$/i, 'Earthing and double insulation'],
  [/^outer casing of an electrical appliance must be either non-conducting .* or earthed$/i, 'Earthing and double insulation'],
  [/^conductor moving across a magnetic field or a changing magnetic field linking with a conductor$/i, 'Electromagnetic induction'],
  [/^factors affecting the magnitude of an induced e\.m\.f$/i, 'Factors affecting induced e.m.f.'],
  [/^simple form of a\.c\. generator$/i, 'A.C. generator'],
  [/^simple form of a\.c\. generator .*$/i, 'A.C. generator'],
  [/^graphs of e\.m\.f\. against time for simple a\.c\. generators$/i, 'A.C. generator graphs'],
  [/^magnetic field due to currents in straight wires and in solenoids$/i, 'Magnetic fields in wires and solenoids'],
  [/^pattern of the magnetic field .*straight wires and in solenoids$/i, 'Magnetic fields in wires and solenoids'],
  [/^direction of an induced e\.m\.f\. opposes the change causing it$/i, "Lenz's law"],
  [/^effect on the magnetic field around straight wires and solenoids of changing the magnitude and direction of the current$/i, 'Factors affecting magnetic fields in wires and solenoids'],
  [/^construction of a simple transformer with a soft-iron core$/i, 'Transformer construction'],
  [/^position of the centre of gravity of an irregularly shaped plane lamina$/i, 'Centre of gravity of an irregular lamina'],
  [/^terms primary, secondary, step-up and step-down$/i, 'Transformer terminology'],
  [/^transformers in high- voltage transmission of electricity$/i, 'Transformers in power transmission'],
  [/^sources that make a significant contribution to background radiation$/i, 'Sources of background radiation'],
  [/^effects of ionising nuclear radiations? on living things$/i, 'Effects of ionising radiation'],
  [/^count rate measured in counts \/ s or counts \/ minute$/i, 'Count rate'],
  [/^alpha .* beta .* gamma .* emissions from the nucleus.*$/i, 'Alpha, beta and gamma radiation'],
  [/^during α-decay or β-decay, the nucleus changes to that of a different element$/i, 'Nuclear decay and transmutation'],
  [/^strength of the gravitational field .*around a planet$/i, 'Gravitational field strength around planets'],
  [/^time it takes light to travel a significant distance.*$/i, 'Light-year'],
  [/^sun contains most of the mass of the Solar System.*$/i, 'Mass of the Solar System'],
  [/^force that keeps an object in orbit around the Sun$/i, 'Orbital force'],
  [/^light emitted from distant galaxies appears redshifted.*$/i, 'Redshift'],
  [/^object either remains at rest or continues in a straight line at constant speed$/i, "Newton's first law"],
  [/^typical uses of the different regions of the electromagnetic spectrum$/i, 'Uses of the electromagnetic spectrum'],
  [/^harmful effects on people of excessive exposure to electromagnetic radiation$/i, 'Hazards of electromagnetic radiation'],
  [/^many important systems of communications rely on electromagnetic radiation$/i, 'Electromagnetic radiation in communications'],
  [/^direction of the force on beams of charged particles in a magnetic field$/i, 'Force on charged particles in magnetic fields'],
  [/^scattering of alpha .* particles by a sheet of thin metal.*$/i, 'Alpha-particle scattering'],
  [/^terms proton number .* nucleon number .*$/i, 'Proton number and nucleon number'],
  [/^relationship between the proton number and the relative charge on a nucleus$/i, 'Proton number and nuclear charge'],
  [/^relationship between the nucleon number and the relative mass of a nucleus$/i, 'Nucleon number and nuclear mass'],
  [/^measurements of background radiation to determine a corrected count rate$/i, 'Corrected count rate'],
  [/^how the type of radiation emitted and the half-life of an isotope determine.*$/i, 'Radiation type, half-life and uses'],
  [/^average orbital speed from the equation.*$/i, 'Average orbital speed'],
  [/^planetary data about orbital distance, orbital duration, density, surface temperature and uniform gravitational field strength.*$/i, 'Planetary data analysis'],
  [/^cmbr was produced shortly after the Universe was formed.*$/i, 'Cosmic microwave background radiation'],
  [/^earth orbits the Sun once in approximately 365 days$/i, "Earth's orbit and seasons"],
  [/^light emitted from distant galaxies appears redshifted$/i, 'Redshift'],
  [/^redshift in the light from distant galaxies$/i, 'Redshift'],
  [/^photosynthesis as the process by which plants synthesise carbohydrates.*$/i, 'Photosynthesis'],
  [/^word equation for photosynthesis as:.*$/i, 'Word equation for photosynthesis'],
  [/^balanced chemical equation for photosynthesis as:.*$/i, 'Balanced equation for photosynthesis'],
  [/^chlorophyll is a green pigment that is found in chloroplasts$/i, 'Chlorophyll'],
  [/^chlorophyll transfers energy from light into energy in chemicals.*$/i, 'Role of chlorophyll in photosynthesis'],
  [/^subsequent use and storage of the carbohydrates made in photosynthesis.*$/i, 'Uses and storage of photosynthetic carbohydrates'],
  [/^importance of:.*nitrate ions.*magnesium ions.*$/i, 'Nitrate and magnesium ions in plants'],
  [/^need for chlorophyll, light and carbon dioxide for photosynthesis$/i, 'Requirements for photosynthesis'],
  [/^(?:the\s+)?need for chlorophyll, light and carbon dioxide for photosynthesis$/i, 'Requirements for photosynthesis'],
  [/^effects of varying light intensity, carbon dioxide concentration and temperature on the rate of photosynthesis$/i, 'Factors affecting photosynthesis'],
  [/^effect of light and dark conditions on gas exchange in an aquatic plant.*$/i, 'Light and dark effects on gas exchange'],
  [/^limiting factors of photosynthesis.*$/i, 'Limiting factors of photosynthesis'],
  [/^leaf of a dicotyledonous plant:.*$/i, 'Leaf structures'],
  [/^structures in the leaf of a dicotyledonous plant:.*$/i, 'Leaf structures'],
  [/^how the structures listed in 6\.2\.2 adapt leaves for photosynthesis$/i, 'Leaf adaptations for photosynthesis'],
  [/^the structures listed in 6\.2\.2 adapt leaves for photosynthesis$/i, 'Leaf adaptations for photosynthesis'],
  [/^types of human teeth:.*$/i, 'Types of human teeth'],
  [/^types of human teeth in physical digestion of food$/i, 'Functions of human teeth in physical digestion'],
  [/^role of chemical digestion in producing small soluble molecules.*$/i, 'Chemical digestion'],
  [/^bile in emulsifying fats and oils.*$/i, 'Emulsification by bile'],
  [/^significance of villi and microvilli.*$/i, 'Villi and microvilli'],
  [/^root hair cells and state their functions$/i, 'Root hair cells'],
  [/^water evaporates from the surfaces of the mesophyll cells.*$/i, 'Transpiration pathway'],
  [/^components of blood as:.*$/i, 'Components of blood'],
  [/^red and white blood cells in photomicrographs and diagrams$/i, 'Red and white blood cells'],
  [/^importance of the following in controlling the spread of disease$/i, 'Disease control'],
  [/^parts of the breathing system:.*$/i, 'Breathing system structures'],
  [/^breathing system:.*$/i, 'Breathing system structures'],
  [/^parts of an insect-pollinated flower:.*$/i, 'Parts of an insect-pollinated flower'],
  [/^insect-pollinated flower:.*$/i, 'Parts of an insect-pollinated flower'],
  [/^anthers and stigmas of a wind-pollinated flower$/i, 'Wind-pollinated flower structures'],
  [/^functions of the following parts of the male reproductive system:.*$/i, 'Male reproductive system functions'],
  [/^functions of the following parts of the female reproductive system:.*$/i, 'Female reproductive system functions'],
  [/^functions of the following in the development of the fetus:.*$/i, 'Structures in fetal development'],
  [/^anaerobic respiration releases much less energy.*$/i, 'Energy release in anaerobic respiration'],
  [/^word equation for anaerobic respiration in yeast as:.*$/i, 'Anaerobic respiration in yeast'],
  [/^word equation for anaerobic respiration in muscles.*$/i, 'Anaerobic respiration in muscles'],
  [/^sensory, relay and motor neurones$/i, 'Types of neurones'],
  [/^specific endocrine glands and state the hormones they secrete$/i, 'Endocrine glands and hormones'],
  [/^examples of asexual reproduction in diagrams, images and information provided$/i, 'Examples of asexual reproduction'],
  [/^images or other information about a species to describe its adaptive features$/i, 'Adaptive features from evidence'],
  [/^roles of testosterone and oestrogen.*$/i, 'Roles of testosterone and oestrogen'],
  [/^dna controls cell function by controlling the production of proteins$/i, 'DNA and protein synthesis'],
  [/^most body cells in an organism contain the same genes.*$/i, 'Gene expression in cells'],
  [/^role of mitosis in growth, repair of damaged tissues, replacement of cells and asexual reproduction$/i, 'Roles of mitosis'],
  [/^during mitosis, the copies of chromosomes separate.*$/i, 'Chromosome separation in mitosis'],
  [/^two identical homozygous individuals that breed together will be pure-breeding$/i, 'Pure-breeding'],
  [/^pedigree diagrams for the inheritance of a given characteristic$/i, 'Pedigree diagrams'],
  [/^genetic diagrams to predict the results of monohybrid crosses$/i, 'Monohybrid genetic diagrams'],
  [/^continuous variation results in a range of phenotypes between two extremes$/i, 'Continuous variation'],
  [/^discontinuous variation results in a limited number of phenotypes with no intermediates$/i, 'Discontinuous variation'],
  [/^factors affecting the rate of population growth for a population of an organism$/i, 'Factors affecting population growth'],
  [/^the factors affecting the rate of population growth for a population of an organism$/i, 'Factors affecting population growth'],
  [/^lag, exponential \(log\), stationary and death phases in the sigmoid curve of population growth.*$/i, 'Sigmoid population growth curve'],
  [/^advantages and disadvantages of large-scale monocultures of crop plants$/i, 'Large-scale monocultures'],
  [/^anaerobic respiration in yeast during the production of ethanol for biofuels$/i, 'Biofuel production with yeast'],
  [/^characteristics of living organisms$/i, 'Characteristics of living organisms'],
  [/^dichotomous keys based on identifiable features$/i, 'Dichotomous keys'],
  [/^main features used to place all organisms into one of the five kingdoms:.*$/i, 'Five kingdoms'],
  [/^main features used to place organisms into groups within the plant kingdom$/i, 'Plant kingdom groups'],
  [/^main features used to place organisms into groups within the animal kingdom$/i, 'Animal kingdom groups'],
  [/^main features used to place animals and plants into the appropriate kingdoms$/i, 'Kingdom features'],
  [/^magnification$/i, 'Magnification'],
  [/^energy for diffusion$/i, 'Energy for diffusion'],
  [/^energy for diffusion comes from the kinetic energy of random movement of molecules and ions$/i, 'Kinetic energy and diffusion'],
  [/^some substances move into and out of cells by diffusion$/i, 'Diffusion across cell membranes'],
  [/^importance of diffusion of gases and solutes in living organisms$/i, 'Importance of diffusion'],
  [/^role of water as a solvent in organisms$/i, 'Water as a solvent'],
  [/^water diffuses through partially permeable membranes by osmosis$/i, 'Osmosis'],
  [/^water moves into and out of cells by osmosis$/i, 'Osmosis in cells'],
  [/^osmosis using materials such as dialysis tubing$/i, 'Osmosis experiments'],
  [/^effects on plant tissues of immersing them in solutions of different concentrations$/i, 'Plant tissues in different concentrations'],
  [/^effects on plant cells of immersing them in solutions of different concentrations.*$/i, 'Osmosis in plant cells'],
  [/^importance of water potential and osmosis in the uptake and loss of water by organisms$/i, 'Water potential and osmosis'],
  [/^active transport$/i, 'Active transport'],
  [/^protein carriers move molecules or ions across a membrane during active transport$/i, 'Protein carriers in active transport'],
  [/^digestion of protein by proteases in the digestive system$/i, 'Protein digestion by proteases'],
  [/^effects of variation of temperature and wind speed on transpiration rate$/i, 'Temperature and wind speed effects on transpiration'],
  [/^effects on the rate of transpiration of varying the following factors:.*$/i, 'Factors affecting transpiration'],
  [/^importance of the septum in separating oxygenated and deoxygenated blood$/i, 'Importance of the septum'],
  [/^roles of diet and exercise in reducing the risk of coronary heart disease$/i, 'Diet and exercise in coronary heart disease'],
  [/^the main blood vessels to and from the liver as:.*$/i, 'Blood vessels to and from the liver'],
  [/^role of vaccination in controlling the spread of diseases$/i, 'Vaccination'],
  [/^importance of breast-feeding for the development of passive immunity in infants$/i, 'Breast-feeding and passive immunity'],
  [/^role of the ribs, the internal and external intercostal muscles and the diaphragm.*$/i, 'Ventilation mechanism'],
  [/^effects of physical activity on the rate and depth of breathing.*$/i, 'Physical activity and breathing rate'],
  [/^lactic acid builds up in muscles and blood during vigorous exercise causing an oxygen debt$/i, 'Oxygen debt'],
  [/^structure and function of a nephron and its associated blood vessels$/i, 'Structure and function of a nephron'],
  [/^liver in the assimilation of amino acids by converting them to proteins$/i, 'Liver and amino acid assimilation'],
  [/^synapses ensure that impulses travel in one direction only$/i, 'Synapses and one-way transmission'],
  [/^distribution of rods and cones in the retina of a human$/i, 'Distribution of rods and cones'],
  [/^control of blood glucose concentration by the liver and the roles of insulin and glucagon$/i, 'Blood glucose control'],
  [/^skin: hairs, hair erector muscles, sweat glands, receptors, sensory neurones, blood vessels and fatty tissue$/i, 'Skin structures in thermoregulation'],
  [/^maintenance of a constant internal body temperature in mammals$/i, 'Thermoregulation'],
  [/^potential effects of self-pollination and cross-pollination on a population$/i, 'Effects of self- and cross-pollination'],
  [/^placenta and umbilical cord in relation to the exchange.*$/i, 'Placenta and umbilical cord exchange'],
  [/^sites of production of oestrogen and progesterone.*$/i, 'Production sites of oestrogen and progesterone'],
  [/^role of hormones in controlling the menstrual cycle and pregnancy$/i, 'Hormonal control of the menstrual cycle and pregnancy'],
  [/^sequence of bases in a gene determines.*$/i, 'Base sequence and amino acid sequence'],
  [/^different sequences of amino acids give different shapes to protein molecules$/i, 'Amino acid sequence and protein shape'],
  [/^use a test cross to identify an unknown genotype.*$/i, 'Test cross'],
  [/^ionising radiation and some chemicals increase the rate of mutation$/i, 'Causes of mutation'],
  [/^adaptive features of hydrophytes and xerophytes to their environments$/i, 'Hydrophyte and xerophyte adaptations'],
  [/^pyramids of energy.*$/i, 'Pyramids of energy'],
  [/^transfer of energy from one trophic level to another$/i, 'Energy transfer between trophic levels'],
  [/^factors that lead to each phase in the sigmoid curve of population growth.*$/i, 'Factors affecting sigmoid growth phases'],
  [/^sources and effects of pollution of the air by methane and carbon dioxide$/i, 'Air pollution by methane and carbon dioxide'],
  [/^artificial insemination \(AI\) and in vitro fertilisation \(IVF\) in captive breeding programmes$/i, 'AI and IVF in captive breeding'],
  [/^conditions that need to be controlled in a fermenter$/i, 'Fermenter conditions'],
  [/^growth of the pollen tube and its entry into the ovule followed by fertilisation.*$/i, 'Pollen tube growth and fertilisation'],
  [/^chemical elements that make up: carbohydrates, fats and proteins$/i, 'Elements in carbohydrates, fats and proteins'],
  [/^relative charges and relative masses of a proton, a neutron and an electron$/i, 'Charges and masses of subatomic particles'],
  [/^elements, compounds and mixtures$/i, 'Elements, compounds and mixtures'],
  [/^particle separation, arrangement and motion$/i, 'Particle model of states of matter'],
  [/^changes of state$/i, 'Changes of state'],
  [/^kinetic particle theory$/i, 'Diffusion'],
  [/^relative atomic mass$/i, 'Relative atomic mass'],
  [/^relative atomic mass of an element from the relative masses and abundances of its isotopes$/i, 'Relative atomic mass from isotopes'],
  [/^relative molecular mass$/i, 'Relative molecular mass'],
  [/^reacting masses in simple proportions$/i, 'Reacting masses'],
  [/^reacting masses in simple proportions.*$/i, 'Reacting masses'],
  [/^mass \(g\) molar mass \(g \/ mol\)$/i, 'Mole equation'],
  [/^amount of substance \(mol\)\s*=.*$/i, 'Amount of substance equation'],
  [/^molar gas volume$/i, 'Molar gas volume'],
  [/^stoichiometric reacting masses, limiting reactants,.*$/i, 'Stoichiometric calculations'],
  [/^experimental data from a titration.*$/i, 'Titration calculations'],
  [/^empirical formulae and molecular formulae.*$/i, 'Empirical and molecular formulae'],
  [/^percentage yield, percentage composition by mass and percentage purity.*$/i, 'Percentage yield, composition and purity'],
  [/^concentration can be measured in g \/ dm3 or mol \/ dm3$/i, 'Concentration units'],
  [/^electrolysis$/i, 'Electrolysis'],
  [/^products formed at the electrodes.*$/i, 'Products of electrolysis'],
  [/^hydrogen[–-]oxygen fuel cell uses hydrogen and oxygen to produce electricity.*$/i, 'Hydrogen-oxygen fuel cells'],
  [/^exothermic reaction transfers thermal energy.*$/i, 'Exothermic reactions'],
  [/^endothermic reaction takes in thermal energy from the surroundings$/i, 'Endothermic reactions'],
  [/^endothermic reaction takes in thermal energy.*$/i, 'Endothermic reactions'],
  [/^ionic bonding$/i, 'Ionic bonding'],
  [/^ionic bonds between elements from Group I and Group VII$/i, 'Ionic bonding in Group I and Group VII'],
  [/^ionic bonds between ions of metallic and non-metallic elements$/i, 'Ionic bonding between metals and non-metals'],
  [/^properties of ionic compounds$/i, 'Properties of ionic compounds'],
  [/^properties of simple molecular compounds$/i, 'Properties of simple molecular substances'],
  [/^structure and bonding the properties of simple molecular compounds$/i, 'Properties of simple molecular substances'],
  [/^giant covalent structures of graphite and diamond.*$/i, 'Graphite and diamond structures'],
  [/^similarity in properties between diamond and silicon\(IV\) oxide.*$/i, 'Diamond and silicon(IV) oxide'],
  [/^properties of metals$/i, 'Properties of metals'],
  [/^formulae of the elements and compounds named in the subject content$/i, 'Formulae of elements and compounds'],
  [/^formula of a simple compound.*$/i, 'Deducing chemical formulae'],
  [/^formula of an ionic compound.*$/i, 'Deducing ionic formulae'],
  [/^word equations and symbol equations.*$/i, 'Word and symbol equations'],
  [/^symbol equation with state symbols.*$/i, 'Symbol equations with state symbols'],
  [/^ionic half-equations.*$/i, 'Ionic half-equations'],
  [/^physical and chemical changes.*$/i, 'Physical and chemical changes'],
  [/^practical methods for investigating the rate of a reaction$/i, 'Rate of reaction experiments'],
  [/^reaction pathway diagrams showing exothermic and endothermic reactions$/i, 'Reaction pathway diagrams'],
  [/^reaction pathway diagrams for exothermic and endothermic reactions$/i, 'Reaction pathway diagrams'],
  [/^label reaction pathway diagrams for exothermic and endothermic reactions$/i, 'Reaction pathway diagrams'],
  [/^symbol equation for the production of ammonia in the Haber process.*$/i, 'Haber process equation'],
  [/^sources of the hydrogen .* and nitrogen .* in the Haber process$/i, 'Haber process reactant sources'],
  [/^symbol equation for the conversion of sulfur dioxide to sulfur trioxide in the Contact process.*$/i, 'Contact process equation'],
  [/^sources of the sulfur dioxide .* and oxygen .* in the Contact process$/i, 'Contact process reactant sources'],
  [/^typical conditions for the conversion of sulfur dioxide to sulfur trioxide in the Contact process$/i, 'Contact process conditions'],
  [/^Roman numeral to indicate the oxidation number of an element in a compound$/i, 'Roman numerals in compound names'],
  [/^aqueous solutions of acids contain H\+ ions and aqueous solutions of alkalis contain OH[–-] ions$/i, 'Ions in acids and alkalis'],
  [/^hydrogen ion concentration, neutrality, relative acidity and relative alkalinity$/i, 'pH and acidity'],
  [/^preparation, separation and purification of soluble salts by reaction of an acid with$/i, 'Preparation of soluble salts'],
  [/^change from metallic to non[-‑–]metallic character across a period$/i, 'Metallic and non-metallic trends'],
  [/^group number and the charge of the ions formed from elements in that group$/i, 'Group number and ion charge'],
  [/^similarities in the chemical properties of elements in the same group of the Periodic Table$/i, 'Group similarities'],
  [/^position of an element in the Periodic Table$/i, 'Position in the Periodic Table'],
  [/^displacement reactions of halogens with other halide ions.*$/i, 'Halogen displacement reactions'],
  [/^order of reactivity from a given set of experimental results$/i, 'Reactivity order from experimental results'],
  [/^order of the reactivity series as:.*$/i, 'Reactivity series order'],
  [/^conditions required for the rusting of iron and steel.*$/i, 'Conditions for rusting'],
  [/^temperature and pressure on the volume of a gas$/i, 'Effects of temperature and pressure on gas volume'],
  [/^effect of relative molecular mass on the rate of diffusion of gases$/i, 'Relative molecular mass and diffusion rate'],
  [/^barrier methods prevent rusting by excluding oxygen or water$/i, 'Barrier methods for rust prevention'],
  [/^ease in obtaining metals from their ores.*$/i, 'Reactivity series and extraction'],
  [/^extraction of iron from hematite in the blast furnace$/i, 'Blast furnace extraction of iron'],
  [/^symbol equations for the extraction of iron from hematite.*$/i, 'Blast furnace equations'],
  [/^extraction of aluminium from purified bauxite \/ aluminium oxide$/i, 'Extraction of aluminium'],
  [/^npk fertilisers to provide the elements nitrogen, phosphorus and potassium.*$/i, 'NPK fertilisers'],
  [/^word equation for photosynthesis,.*$/i, 'Word equation for photosynthesis'],
  [/^symbol equation for photosynthesis,.*$/i, 'Balanced equation for photosynthesis'],
  [/^general formulae of compounds in the same homologous series$/i, 'General formulae in homologous series'],
  [/^types of compound present, given a chemical name ending in .*$/i, 'Identifying organic compound types'],
  [/^separation of petroleum into useful fractions by fractional distillation$/i, 'Fractional distillation of petroleum'],
  [/^properties of fractions obtained from petroleum change from the bottom to the top of the fractionating column$/i, 'Trends in petroleum fractions'],
  [/^some chemical reactions are reversible.*$/i, 'Reversible reactions'],
  [/^covalent bond is formed when a pair of electrons is shared between two atoms.*$/i, 'Covalent bond'],
  [/^suitable separation and purification techniques.*$/i, 'Separation and purification techniques'],
  [/^substitution reaction one atom or group of atoms$/i, 'Substitution reactions'],
  [/^test to distinguish between saturated and unsaturated hydrocarbons.*$/i, 'Test for unsaturation'],
  [/^advantages and disadvantages of the manufacture of ethanol by.*$/i, 'Ethanol manufacture'],
  [/^repeat units and \/ or linkages in addition polymers and in condensation polymers$/i, 'Repeat units and linkages in polymers'],
  [/^structure or repeat unit of an addition polymer.*$/i, 'Addition polymer structures'],
  [/^structure or repeat unit of a condensation polymer.*$/i, 'Condensation polymer structures'],
  [/^structure of proteins as:.*$/i, 'Protein structure'],
  [/^bonding in alkenes includes a double carbon[–-]carbon covalent bond.*$/i, 'Bonding in alkenes'],
  [/^manufacture of alkenes and hydrogen by the cracking of larger alkane molecules$/i, 'Cracking hydrocarbons'],
  [/^suitable separation and purification techniques.*$/i, 'Separation and purification techniques'],
  [/^titration to calculate the moles of solute.*$/i, 'Titration calculations'],
  [/^greenhouse gases carbon dioxide and methane cause global warming$/i, 'Greenhouse gases and global warming'],
  [/^how oxides of nitrogen form in car engines.*$/i, 'Oxides of nitrogen and catalytic converters'],
  [/^acids and bases$/i, 'Acids and bases']
];

function extractEquationLabel(value){
  const formulaSource = String(value || '')
    .replace(/^formula:\s*/i, '')
    .replace(/^equation\s+/i, '')
    .replace(/^equations?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = formulaSource.match(/^(.+?)\s*=\s*.+$/);
  if(!match) return '';

  let label = match[1].trim();
  if(!label || /[;:]/.test(label) || SYLLABUS_COMMAND_WORD_PATTERN.test(label) || label.split(/\s+/).length > 7){
    return '';
  }
  while(/\s+(?:[A-Za-z]|[∆ρλπμ]|Ek|Ep|Vp|Vs|Np|Ns|Ip|Is|H0)$/u.test(label)){
    label = label.replace(/\s+(?:[A-Za-z]|[∆ρλπμ]|Ek|Ep|Vp|Vs|Np|Ns|Ip|Is|H0)$/u, '').trim();
  }

  label = label
    .replace(/\bworking$/i, 'work')
    .replace(/\s+/g, ' ')
    .trim();

  return formatSyllabusLabel(label);
}

function matchSyllabusConceptLabel(value){
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if(!text) return '';
  for(const [pattern, label] of SYLLABUS_CONCEPT_LABEL_RULES){
    if(pattern.test(text)) return label;
  }
  return '';
}

function compactSyllabusPointLabel(text){
  const rawValue = normalizeSyllabusSubtopicText(text)
    .replace(/^\(?[a-z]\)?\s+/i, '')
    .replace(/^\d+\s+/, '')
    .trim();
  if(/^(?:continued|T)$/i.test(rawValue)) return '';
  if(/^(?:t\s+)?[∆Δ]E\s+\(b\)(?:\s+P\s*=\s*t)?$/u.test(rawValue)) return '';
  if(/^State and use the formula:\s*magnification\s*=\s*image size.*$/i.test(rawValue)) return 'Magnification formula';
  if(/^Describe the use of:\s*.*iodine solution.*Benedict.*biuret.*ethanol emulsion.*DCPIP.*$/i.test(rawValue)) return 'Food tests';
  if(/^Know what is meant by background radiation$/i.test(rawValue)) return 'Background radiation';
  if(/^State where, in the digestive system, amylase, protease and lipase are secreted and where they act$/i.test(rawValue)) return 'Sites of enzyme secretion and action';
  if(/^Investigate, using a suitable stain, the pathway of water through the above-ground parts of a plant$/i.test(rawValue)) return 'Water pathway in plants';
  if(/^State the functions of the following components of blood:.*$/i.test(rawValue)) return 'Functions of blood components';
  if(/^State the functions of the structures listed in 16\.3\.1$/i.test(rawValue)) return 'Functions of flower parts';
  if(/^Explain the mechanism by which water moves upwards in the xylem.*$/i.test(rawValue)) return 'Transpiration pull';
  if(/^Explain the relative thickness of:.*$/i.test(rawValue)) return 'Relative thickness of heart muscle walls';
  if(/^Describe the events at a synapse as:.*$/i.test(rawValue)) return 'Events at a synapse';
  if(/^State the functions of:\s*\(a\)\s*lymphocytes.*\(?b\)?\s*phagocytes.*$/i.test(rawValue)) return 'Functions of lymphocytes and phagocytes';
  if(/^Describe the effect on the rate of reaction of:.*$/i.test(rawValue)) return 'Factors affecting rate of reaction';
  if(/^Describe and explain the effect on the rate of reaction of:.*$/i.test(rawValue)) return 'Collision theory and rate factors';
  if(/^Define redox reactions as involving simultaneous oxidation and reduction$/i.test(rawValue)) return 'Redox reactions';
  if(/^State the appearance of the halogens at r\.t\.p\. as:.*$/i.test(rawValue)) return 'Appearance of halogens at r.t.p.';
  if(/^State and explain strategies to reduce the effects of these environmental issues.*$/i.test(rawValue)) return 'Reducing climate change and acid rain';
  if(/^Name and draw the displayed formulae of:.*$/i.test(rawValue)) return 'Displayed formulae of organic compounds';
  if(/^Name and draw the structural and displayed formulae of unbranched:.*$/i.test(rawValue)) return 'Structural and displayed formulae of unbranched compounds';
  if(/^Name and draw the displayed formulae of the unbranched esters.*$/i.test(rawValue)) return 'Displayed formulae of unbranched esters';
  if(/^Name the uses of the fractions as:.*$/i.test(rawValue)) return 'Uses of petroleum fractions';
  if(/^Describe the manufacture of ethanol by:.*$/i.test(rawValue)) return 'Manufacture of ethanol';
  if(/^Describe the advantages and disadvantages of the manufacture of ethanol by:.*$/i.test(rawValue)) return 'Advantages and disadvantages of ethanol manufacture';
  if(/^State the uses of ethanol as:.*$/i.test(rawValue)) return 'Uses of ethanol';
  if(/^Describe the reaction of ethanoic acid with:.*$/i.test(rawValue)) return 'Reactions of ethanoic acid';
  if(/^Describe the reaction of a carboxylic acid with an alcohol.*$/i.test(rawValue)) return 'Esterification';
  if(/^Describe the advantages and disadvantages of using hydrogen[–-]oxygen fuel cells.*$/i.test(rawValue)) return 'Advantages and disadvantages of hydrogen-oxygen fuel cells';
  if(/^Describe the reactions, if any, of:.*$/i.test(rawValue)) return 'Reactions of metals with water, steam and dilute acid';
  if(/^Describe the general characteristics of a homologous series as:.*$/i.test(rawValue)) return 'General characteristics of a homologous series';
  if(/^Describe and draw the structure of:\s*\(a\)\s*nylon.*\(?b\)?\s*PET.*$/i.test(rawValue)) return 'Structures of nylon and PET';
  if(/^State and use the equation for Rf:.*$/i.test(rawValue)) return 'Rf values';
  if(/^Describe and explain this motion .*Brownian motion.*$/i.test(rawValue)) return 'Brownian motion';
  if(/^Recall and use the equation pV = constant.*$/i.test(rawValue)) return 'Pressure-volume relationship';
  if(/^Convert temperatures between kelvin and degrees Celsius.*$/i.test(rawValue)) return 'Temperature conversion between kelvin and Celsius';
  if(/^Describe thermal conduction in all solids.*$/i.test(rawValue)) return 'Thermal conduction in solids';
  if(/^Describe, in terms of particles, why thermal conduction is bad in gases and most liquids$/i.test(rawValue)) return 'Poor thermal conduction in gases and liquids';
  if(/^Know that there are many solids that conduct thermal energy better than thermal insulators.*$/i.test(rawValue)) return 'Moderate thermal conductors';
  if(/^Know what happens to an object if the rate at which it receives energy is less or more than.*$/i.test(rawValue)) return 'Net thermal energy gain and loss';
  if(/^Know how the temperature of the Earth is affected by factors controlling the balance.*$/i.test(rawValue)) return "Earth's energy balance";
  if(/^Explain, in terms of the motion and arrangement of particles, the relative order of magnitudes of the expansion of solids, liquids and gases.*$/i.test(rawValue)) return 'Relative expansion of solids, liquids and gases';
  if(/^Describe an experiment to show that a force acts on a current-carrying conductor in a magnetic field.*$/i.test(rawValue)) return 'Force on a current-carrying conductor';
  if(/^Know that the Sun is a star of medium size.*$/i.test(rawValue)) return 'Sun as a star';
  if(/^Know that stars are powered by nuclear reactions.*$/i.test(rawValue)) return 'Stellar energy from nuclear fusion';
  if(/^Know that the speed v at which a galaxy is moving away from the Earth.*$/i.test(rawValue)) return 'Galaxy recession speed';
  if(/^Know that the distance d of a far galaxy can be determined.*$/i.test(rawValue)) return 'Galaxy distance from supernova brightness';
  if(/^Recall that visible light of a single frequency is described as monochromatic$/i.test(rawValue)) return 'Monochromatic light';
  if(/^Know how to construct and use series and parallel circuits$/i.test(rawValue)) return 'Series and parallel circuits';
  if(/^Know how atoms may form positive ions by losing electrons or form negative ions by gaining electrons$/i.test(rawValue)) return 'Ion formation';
  if(/^Recall and use the equation for p\.d\..*$/i.test(rawValue)) return 'Potential difference equation';
  if(/^Define power as work done per unit time.*$/i.test(rawValue)) return 'Power equation';
  if(/^Describe an increase in temperature of an object.*$/i.test(rawValue)) return 'Temperature increase and particle kinetic energy';
  if(/^State that, for a parallel circuit, the current from the source.*$/i.test(rawValue)) return 'Current in parallel circuits';
  if(/^Explain that the sum of the currents into a junction.*$/i.test(rawValue)) return 'Junction rule';
  if(/^Describe the formation of an optical image by a plane mirror.*$/i.test(rawValue)) return 'Plane mirror images';
  if(/^Describe simple experiments to show the production of electrostatic charges by friction.*$/i.test(rawValue)) return 'Electrostatic experiments';
  if(/^Describe the structure of an atom in terms of.*$/i.test(rawValue)) return 'Atomic structure';
  if(/^Use the nuclide notation A ZX$/i.test(rawValue)) return 'Nuclide notation';
  if(/^Describe how useful energy may be obtained, or electrical power generated, from:.*$/i.test(rawValue)) return 'Energy resources';
  if(/^Describe advantages and disadvantages of each method.*$/i.test(rawValue)) return 'Advantages and disadvantages of energy resources';
  if(/^Know that energy is released by nuclear fusion in the Sun$/i.test(rawValue)) return 'Energy release by nuclear fusion in the Sun';
  if(/^State that the Sun is the principal source of energy input to biological systems$/i.test(rawValue)) return 'Sun as the main energy source';
  if(/^Investigate and describe the use of biological washing powders that contain enzymes$/i.test(rawValue)) return 'Biological washing powders with enzymes';
  if(/^Explain, in terms of energy loss, why food chains usually have fewer than five trophic levels$/i.test(rawValue)) return 'Length of food chains';
  if(/^Explain why it is more energy efficient for humans to eat crop plants.*$/i.test(rawValue)) return 'Plant-based diets and energy efficiency';
  if(/^Describe and explain diffusion in terms of kinetic particle theory$/i.test(rawValue)) return 'Diffusion';
  if(/^Explain, in terms of kinetic particle theory, the effects of temperature and pressure on the volume of a gas$/i.test(rawValue)) return 'Effects of temperature and pressure on gas volume';
  if(/^Explain, in terms of rate of reaction and position of equilibrium, why the typical conditions stated are used in the Haber process and in the Contact process.*$/i.test(rawValue)) return 'Conditions in the Haber and Contact processes';
  if(/^State some common barrier methods.*$/i.test(rawValue)) return 'Barrier methods for rust prevention';
  if(/^Describe and explain methods of separation and purification using:.*$/i.test(rawValue)) return 'Methods of separation and purification';
  if(/^State that PET can be converted back into monomers and re-polymerised$/i.test(rawValue)) return 'PET recycling';
  if(/^identify in diagrams and images and draw the following parts of an insect[-‑–]pollinated flower:.*$/i.test(rawValue)){
    return 'Parts of an insect-pollinated flower';
  }
  let value = rawValue;

  let prefixRemoved = true;
  while(prefixRemoved && value){
    prefixRemoved = false;
    SYLLABUS_POINT_PREFIX_PATTERNS.some((pattern) => {
      if(!pattern.test(value)) return false;
      value = value.replace(pattern, '').trim();
      prefixRemoved = true;
      return true;
    });
  }
  value = value.replace(/^\(?[a-z]\)?\s+/i, '').trim();

  if(/^formula:\s*magnification\s*=\s*image size.*$/i.test(value)) return 'Magnification formula';
  if(/^average speed\s*=\s*.+$/i.test(value)) return 'Average speed';
  if(/^wave speed\s*=\s*.+$/i.test(value)) return 'Wave speed';
  if(/^qualitatively,\s*in terms of particles,\s*the effect on the pressure of a fixed mass of gas of:.*$/i.test(value)) return 'Gas pressure, temperature and volume';
  if(/^in terms of particles,\s*the effect on the pressure of a fixed mass of gas of:.*$/i.test(value)) return 'Gas pressure, temperature and volume';
  if(/^the effect on the pressure of a fixed mass of gas of:.*$/i.test(value)) return 'Gas pressure, temperature and volume';
  if(/^show that a force acts on a current-carrying conductor in a magnetic field.*$/i.test(value)) return 'Force on a current-carrying conductor';
  if(/^weight as the effect of a gravitational field on a mass$/i.test(value)) return 'Weight';
  if(/^there are positive and negative charges$/i.test(value)) return 'Positive and negative charges';
  if(/^what is meant by background radiation$/i.test(value)) return 'Background radiation';
  if(/^optical image by a plane mirror.*$/i.test(value)) return 'Plane mirror images';
  if(/^light through a transparent material.*$/i.test(value)) return 'Passage of light through transparent materials';
  if(/^(?:an?\s+)?image using the terms.*$/i.test(value)) return 'Image characteristics';
  if(/^(?:a\s+)?virtual image is formed when diverging rays are extrapolated backwards.*$/i.test(value)) return 'Virtual images';
  if(/^light as illustrated by the refraction of white light by a glass prism$/i.test(value)) return 'Dispersion of light';
  if(/^(?:a\s+)?medium is needed to transmit sound waves$/i.test(value)) return 'Sound needs a medium';
  if(/^(?:a\s+)?method involving a measurement of distance and time for determining the speed of sound in air$/i.test(value)) return 'Measuring speed of sound';
  if(/^hazards of:.*$/i.test(value)) return 'Electrical hazards';
  if(/^force acts on a current-carrying conductor in a magnetic field.*$/i.test(value)) return 'Force on a current-carrying conductor';
  if(/^(?:that:\s*)?\(a\).*galaxies are each made up.*light-years.*$/i.test(value)) return 'Galaxies and light-years';
  if(/^research is being carried out to investigate how energy released by nuclear fusion can be used.*$/i.test(value)) return 'Nuclear fusion research';
  if(/^efficiency as:.*$/i.test(value)) return 'Efficiency';
  if(/^Vp Np Vs = Ns.*$/i.test(value)) return 'Transformer equation';
  if(/^for 100% efficiency in a transformer IpVp.*$/i.test(value)) return 'Transformer efficiency';
  if(/^= I2R to explain why power losses in cables.*$/i.test(value)) return 'Power losses in transmission cables';
  if(/^the relative directions of force, field and induced current$/i.test(value)) return 'Relative directions of force, field and induced current';
  if(/^the relative directions of force, magnetic field and current$/i.test(value)) return 'Relative directions of force, magnetic field and current';
  if(/^what is meant by an isotope.*$/i.test(value)) return 'Isotopes';
  if(/^Sun is a star of medium size.*$/i.test(value)) return 'Sun as a star';
  if(/^stars are powered by nuclear reactions.*$/i.test(value)) return 'Stellar energy from nuclear fusion';
  if(/^microwave radiation of a specific frequency is observed.*$/i.test(value)) return 'Cosmic microwave background radiation';
  if(/^the speed v at which a galaxy is moving away from the Earth.*$/i.test(value)) return 'Galaxy recession speed';
  if(/^speed v at which a galaxy is moving away from the Earth.*$/i.test(value)) return 'Galaxy recession speed';
  if(/^the distance d of a far galaxy can be determined.*$/i.test(value)) return 'Galaxy distance from supernova brightness';
  if(/^distance d of a far galaxy can be determined.*$/i.test(value)) return 'Galaxy distance from supernova brightness';
  if(/^the equation d v = H0 represents an estimate for the age of the Universe.*$/i.test(value)) return 'Age of the Universe estimate';
  if(/^use of:\s*.*iodine solution.*Benedict.*biuret.*ethanol emulsion.*DCPIP.*$/i.test(value)) return 'Food tests';
  if(/^Sun is the principal source of energy input to biological systems$/i.test(value)) return 'Sun as the main energy source';
  if(/^(?:and\s+)?interpret simple food chains$/i.test(value)) return 'Simple food chains';
  if(/^consumers may be classed as primary, secondary, tertiary and quaternary.*$/i.test(value) || /^consumers$/i.test(value)) return 'Consumer levels';
  if(/^functions of the types of human teeth in physical digestion of food$/i.test(value)) return 'Functions of human teeth';
  if(/^functions of the following components of blood:.*$/i.test(value)) return 'Functions of blood components';
  if(/^the structures listed in 16\.3\.1$/i.test(value)) return 'Functions of flower parts';
  if(/^sources as the parts of plants that release sucrose or amino acids.*sinks as the parts.*$/i.test(value)) return 'Sources and sinks';
  if(/^the mechanism by which water moves upwards in the xylem.*$/i.test(value)) return 'Transpiration pull';
  if(/^the relative thickness of:.*$/i.test(value)) return 'Relative thickness of heart muscle walls';
  if(/^the function of cartilage in the trachea$/i.test(value)) return 'Function of tracheal cartilage';
  if(/^the structure and function of a nephron.*$/i.test(value)) return 'Nephron structure and function';
  if(/^the function of rods and cones.*$/i.test(value)) return 'Functions of rods and cones';
  if(/^events at a synapse as:.*$/i.test(value)) return 'Events at a synapse';
  if(/^decomposer as an organism that gets its energy from dead or waste organic material .*impact humans have.*trophic levels.*$/i.test(value)) return 'Decomposers, human impacts and trophic levels';
  if(/^pyramids of energy .*$/i.test(value)) return 'Pyramids of energy';
  if(/^why the transfer of energy from one trophic level to another is often not efficient$/i.test(value)) return 'Inefficient energy transfer between trophic levels';
  if(/^(?:,\s*in terms of energy loss,\s*)?why food chains usually have fewer than five trophic levels$/i.test(value)) return 'Length of food chains';
  if(/^(?:it is\s+)?more energy efficient for humans to eat crop plants.*$/i.test(value)) return 'Plant-based diets and energy efficiency';
  if(/^(?:that:\s*)?\(a\)\s*Group VIII noble gases.*$/i.test(value)) return 'Group and period patterns';
  if(/^effect on the rate of reaction of:.*$/i.test(value)) return 'Factors affecting rate of reaction';
  if(/^redox reactions as involving simultaneous oxidation and reduction$/i.test(value)) return 'Redox reactions';
  if(/^appearance of the halogens at r\.t\.p\. as:.*$/i.test(value)) return 'Appearance of halogens at r.t.p.';
  if(/^composition of clean, dry air as approximately.*$/i.test(value)) return 'Composition of clean, dry air';
  if(/^source of each of these air pollutants.*$/i.test(value)) return 'Sources of air pollutants';
  if(/^adverse effect of these air pollutants.*$/i.test(value)) return 'Effects of air pollutants';
  if(/^strategies to reduce the effects of these environmental issues.*$/i.test(value)) return 'Reducing climate change and acid rain';
  if(/^displayed formulae of:.*$/i.test(value)) return 'Displayed formulae of organic compounds';
  if(/^structural and displayed formulae of unbranched:.*$/i.test(value)) return 'Structural and displayed formulae of unbranched compounds';
  if(/^displayed formulae of the unbranched esters.*$/i.test(value)) return 'Displayed formulae of unbranched esters';
  if(/^uses of the fractions as:.*$/i.test(value)) return 'Uses of petroleum fractions';
  if(/^manufacture of ethanol by:.*$/i.test(value)) return 'Manufacture of ethanol';
  if(/^advantages and disadvantages of the manufacture of ethanol by:.*$/i.test(value)) return 'Advantages and disadvantages of ethanol manufacture';
  if(/^uses of ethanol as:.*$/i.test(value)) return 'Uses of ethanol';
  if(/^reaction of ethanoic acid with:.*$/i.test(value)) return 'Reactions of ethanoic acid';
  if(/^reaction of a carboxylic acid with an alcohol.*$/i.test(value)) return 'Esterification';
  if(/^advantages and disadvantages of using hydrogen[–-]oxygen fuel cells.*$/i.test(value)) return 'Advantages and disadvantages of hydrogen-oxygen fuel cells';
  if(/^reactions, if any, of:.*$/i.test(value)) return 'Reactions of metals with water, steam and dilute acid';
  if(/^general characteristics of a homologous series as:.*$/i.test(value)) return 'General characteristics of a homologous series';
  if(/^structure of:\s*\(a\)\s*nylon.*\(?b\)?\s*PET.*$/i.test(value)) return 'Structures of nylon and PET';
  if(/^equation for Rf:.*$/i.test(value)) return 'Rf values';
  if(/^PET can be converted back into monomers and re-polymerised$/i.test(value)) return 'PET recycling';
  if(/^explain diffusion$/i.test(value)) return 'Diffusion';
  if(/^some common barrier methods.*$/i.test(value)) return 'Barrier methods for rust prevention';
  if(/^and explain methods of separation and purification using:.*$/i.test(value)) return 'Methods of separation and purification';
  if(/^methods of separation and purification using:.*$/i.test(value)) return 'Methods of separation and purification';
  if(/^why the typical conditions stated are used in the Haber process and in the Contact process.*$/i.test(value)) return 'Conditions in the Haber and Contact processes';
  if(/^(?:,\s*in terms of rate of reaction and position of equilibrium,\s*)?why the typical conditions stated are used in the Haber process and in the Contact process.*$/i.test(value)) return 'Conditions in the Haber and Contact processes';
  if(/^changes of state in terms of kinetic particle theory.*$/i.test(value)) return 'Kinetic particle theory and changes of state';
  if(/^(?:,\s*in terms of kinetic particle theory,\s*)?the effects of temperature and pressure on the volume of a gas$/i.test(value)) return 'Effects of temperature and pressure on gas volume';
  if(/^the effects of temperature and pressure on the volume of a gas$/i.test(value)) return 'Effects of temperature and pressure on gas volume';
  if(/^how the position of equilibrium is affected by:.*$/i.test(value)) return 'Factors affecting equilibrium position';
  if(/^changing the conditions can change the direction of a reversible reaction.*$/i.test(value)) return 'Effects of changing conditions on reversible reactions';
  if(/^reversible reaction in a closed system is at equilibrium when:.*$/i.test(value)) return 'Equilibrium in a closed system';
  if(/^for reflection, the angle of incidence is equal to the angle of reflection.*$/i.test(value)) return 'Law of reflection';
  if(/^sin i n = sin r$/i.test(value)) return 'Refractive index equation';
  if(/^n = sin c$/i.test(value) || /^= sin c$/i.test(value)) return 'Critical angle equation';
  if(/^single lens as a magnifying glass$/i.test(value)) return 'Magnifying glass';
  if(/^visible light of a single frequency is described as monochromatic$/i.test(value)) return 'Monochromatic light';
  if(/^thermal conduction in all solids.*$/i.test(value)) return 'Thermal conduction in solids';
  if(/^in terms of particles, why thermal conduction is bad in gases and most liquids$/i.test(value)) return 'Poor thermal conduction in gases and liquids';
  if(/^there are many solids that conduct thermal energy better than thermal insulators.*$/i.test(value)) return 'Moderate thermal conductors';
  if(/^what happens to an object if the rate at which it receives energy is less or more than.*$/i.test(value)) return 'Net thermal energy gain and loss';
  if(/^how the temperature of the Earth is affected by factors controlling the balance.*$/i.test(value)) return "Earth's energy balance";
  if(/^how to construct and use series and parallel circuits$/i.test(value)) return 'Series and parallel circuits';
  if(/^how atoms may form positive ions by losing electrons or form negative ions by gaining electrons$/i.test(value)) return 'Ion formation';
  if(/^(?:,\s*in terms of the motion and arrangement of particles,\s*)?the relative order of magnitudes of the expansion of solids, liquids and gases.*$/i.test(value)) return 'Relative expansion of solids, liquids and gases';
  if(/^explain this motion .*Brownian motion.*$/i.test(value)) return 'Brownian motion';
  if(/^pV = constant for a fixed mass of gas at constant temperature.*$/i.test(value)) return 'Pressure-volume relationship';
  if(/^F = ma.*$/i.test(value) || /^= ma.*$/i.test(value)) return 'Force, mass and acceleration';
  if(/^kinetic energy Ek.*$/i.test(value)) return 'Kinetic energy';
  if(/^the change in gravitational potential energy .*$/i.test(value)) return 'Gravitational potential energy change';
  if(/^mechanical working .*$/i.test(value) || /^mechanical work .*$/i.test(value)) return 'Work done equation';
  if(/^power as work done per unit time.*$/i.test(value) || /^∆E \(b\)$/i.test(value)) return 'Power equation';
  if(/^resistance [VIR= ].*$/i.test(value) || /^resistance$/i.test(value)) return 'Resistance';
  if(/^electrical power .*$/i.test(value)) return 'Electrical power';
  if(/^electrical energy .*$/i.test(value)) return 'Electrical energy';
  if(/^e\.m\.f.*$/i.test(value)) return 'Electromotive force';
  if(/^p\.d\.?$/i.test(value)) return 'Potential difference';
  if(/^p\.d\.?\s*V\s*=.*$/i.test(value)) return 'Potential difference equation';
  if(/^p\.d\. between two points.*$/i.test(value)) return 'Potential difference';
  if(/^p\.d\. across an electrical conductor.*$/i.test(value)) return 'Potential difference across a conductor';
  if(/^two resistors used as a potential divider.*$/i.test(value)) return 'Potential divider equation';
  if(/^mechanical or electrical work done$/i.test(value)) return 'Mechanical and electrical work done';
  if(/^useful energy$/i.test(value)) return 'Energy resources';
  if(/^advantages and disadvantages of each method$/i.test(value)) return 'Advantages and disadvantages of energy resources';
  if(/^energy$/i.test(value) && /1\.7 Energy, work and power/.test(String(text || ''))) return 'Energy stores and transfers';
  if(/^parallel circuit,? the current from the source.*$/i.test(value) || /^parallel circuit the current from the source.*$/i.test(value)) return 'Current in parallel circuits';
  if(/^the current from the source is larger than the current in each branch$/i.test(value)) return 'Current in parallel circuits';
  if(/^sum of the currents into a junction.*$/i.test(value)) return 'Junction rule';
  if(/^rise in the temperature.*$/i.test(value)) return 'Temperature rise and internal energy';
  if(/^increase in temperature.*$/i.test(value)) return 'Temperature increase and particle kinetic energy';
  if(/^microscopic particles$/i.test(value)) return 'Microscopic particles and molecular collisions';
  if(/^atom$/i.test(value)) return 'Atomic structure';
  if(/^nuclide notation A ZX$/i.test(value)) return 'Nuclide notation';
  if(/^[∆Δ]E\s+\(b\)$/u.test(value)) return '';
  if(/^convert temperatures between kelvin and degrees Celsius.*$/i.test(value)) return 'Temperature conversion between kelvin and Celsius';

  if(/^a catalyst as\b/i.test(value)) return 'Catalyst';
  if(/^enzymes as proteins\b/i.test(value)) return 'Enzymes as biological catalysts';
  if(/^why enzymes are important\b/i.test(value)) return 'Importance of enzymes';
  if(/^enzyme action with reference to:\s*active site\b/i.test(value)) return 'Enzyme-substrate complex';
  if(/active site/i.test(value) && /substrate/i.test(value) && /(complementary|shape|fit)/i.test(value)) return 'Active site and substrate fit';
  if(/^the effect of changes in temperature and pH on enzyme activity\b/i.test(value)) return 'Temperature and pH effects on enzyme activity';
  if(/^the effect of changes in temperature on enzyme activity\b/i.test(value)) return 'Temperature effects on enzyme activity';
  if(/^the effect of changes in pH on enzyme activity\b/i.test(value)) return 'pH effects on enzyme activity';
  if(/^temperature and pH on enzyme activity\b/i.test(value)) return 'Temperature and pH effects on enzyme activity';
  if(/^temperature on enzyme activity\b/i.test(value)) return 'Temperature effects on enzyme activity';
  if(/^pH on enzyme activity\b/i.test(value)) return 'pH effects on enzyme activity';
  if(/^the specificity of enzymes\b/i.test(value)) return 'Specificity of enzymes';
  if(/^(?:the\s+)?importance of:.*nitrate ions.*magnesium ions.*$/i.test(value)) return 'Nitrate and magnesium ions in plants';
  if(/^the meaning of the terms:\s*cell,\s*tissue,\s*organ,\s*organ system and organism\b/i.test(value)) return 'Levels of organisation';
  if(/^new cells are produced by division of existing cells$/i.test(value)) return 'Cell division';
  if(/^specialised cells have specific functions\b/i.test(value)) return 'Specialised cell functions';
  if(/^balanced diet$/i.test(value)) return 'Balanced diet';
  if(/^(?:the\s+)?principal dietary sources and describe the importance of:/i.test(value)) return 'Dietary sources and importance';
  if(/^the causes of scurvy and rickets$/i.test(value)) return 'Scurvy and rickets';
  if(/^causes of scurvy and rickets$/i.test(value)) return 'Scurvy and rickets';
  if(/^scurvy and rickets$/i.test(value)) return 'Scurvy and rickets';
  if(/^main organs of the digestive system\b/i.test(value)) return 'Digestive system organs';
  if(/^the organs of the digestive system\b/i.test(value)) return 'Functions of digestive organs';
  if(/^a plant cell with an animal cell\b/i.test(value)) return 'Plant and animal cell structure';
  if(/^a bacterial cell\b/i.test(value)) return 'Bacterial cell structure';
  if(/^cell structures listed in 2\.1\.1 and 2\.1\.2\b/i.test(value)) return 'Cell structure identification';
  if(/^the structures listed in 2\.1\.1 and 2\.1\.2\b/i.test(value)) return 'Functions of cell structures';
  if(/^use of rulers and measuring cylinders\b/i.test(value)) return 'Length and volume measurement';
  if(/^rulers and measuring cylinders\b/i.test(value)) return 'Length and volume measurement';
  if(/^measure a variety of time intervals\b/i.test(value)) return 'Measuring time intervals';
  if(/^an average value for a small distance and for a short interval of time\b/i.test(value)) return 'Average values from repeated measurements';
  if(/^acceleration from the gradient of a speed[–-]time graph.*$/i.test(value)) return 'Gradient of a speed-time graph';
  if(/^forces may produce changes in the size and shape of an object$/i.test(value)) return 'Size and shape changes';
  if(/^load[–-]extension graphs?\b/i.test(value)) return 'Load-extension graphs';
  if(/^the resultant of two or more forces\b/i.test(value)) return 'Resultant force';
  if(/^solid friction\b/i.test(value)) return 'Solid friction';
  if(/^friction \(drag\)\s+acts on an object moving through a liquid\b/i.test(value)) return 'Drag in liquids';
  if(/^friction \(drag\)\s+acts on an object moving through a gas\b/i.test(value)) return 'Drag in gases';
  if(/^the moment of a force as a measure\b/i.test(value)) return 'Moment of a force';
  if(/^the moment of a force as moment\b/i.test(value)) return 'Moment equation';
  if(/^moment of a force as moment\b/i.test(value)) return 'Moment equation';
  if(/^the principle of moments\b/i.test(value)) return 'Principle of moments';
  if(/^when there is no resultant force and no resultant moment\b/i.test(value)) return 'Equilibrium';
  if(/^what is meant by centre of gravity$/i.test(value)) return 'Centre of gravity';
  if(/^an experiment to determine the position of the centre of gravity\b/i.test(value)) return 'Centre of gravity experiment';
  if(/^centre of gravity$/i.test(value)) return 'Definition of centre of gravity';
  if(/^the effect of the position of the centre of gravity on the stability\b/i.test(value)) return 'Centre of gravity and stability';
  if(/^the structure of the atom as\b/i.test(value)) return 'Atomic structure';
  if(/^the atom as\b/i.test(value)) return 'Atomic structure';
  if(/^the relative charges and relative masses of a proton,\s*a neutron and an electron$/i.test(value)) return 'Charges and masses of subatomic particles';
  if(/^proton number\s*\/\s*atomic number\b/i.test(value)) return 'Proton number';
  if(/^mass number\s*\/\s*nucleon number\b/i.test(value)) return 'Mass number';
  if(/^the electronic configuration of elements and their ions\b/i.test(value)) return 'Electronic configuration';
  if(/^that:\s*\(a\)\s*Group VIII noble gases\b/i.test(value)) return 'Group and period patterns';
  if(/^symbols for atoms\b/i.test(value)) return 'Atomic and ionic symbols';
  if(/^appropriate apparatus for the measurement of\b/i.test(value)) return 'Measurement apparatus';
  if(/^advantages and disadvantages of experimental methods and apparatus$/i.test(value)) return 'Experimental methods and apparatus';
  if(/^solvent as a substance that dissolves a solute\b/i.test(value)) return 'Solvent, solute and solution';
  if(/^(?:an?\s+)?acid[–-]base titration\b/i.test(value)) return 'Acid-base titration';
  if(/^identify the end-point of a titration\b/i.test(value)) return 'Titration end-point';
  if(/^(?:the\s+)?need for chlorophyll, light and carbon dioxide for photosynthesis\b.*$/i.test(value)) return 'Requirements for photosynthesis';
  if(/^limiting factors of photosynthesis in different environmental conditions$/i.test(value)) return 'Limiting factors of photosynthesis';
  if(/^(?:the\s+)?following structures in the leaf of a dicotyledonous plant:.*$/i.test(value)) return 'Leaf structures';
  if(/^(?:the\s+)?following parts of the breathing system:.*$/i.test(value)) return 'Breathing system structures';
  if(/^(?:draw the following parts of an\s+|the\s+following parts of an\s+)?insect[-‑–]pollinated flower:.*$/i.test(value)) return 'Parts of an insect-pollinated flower';
  if(/^(?:how\s+)?(?:the\s+)?structures listed in 6\.2\.2 adapt leaves for photosynthesis$/i.test(value)) return 'Leaf adaptations for photosynthesis';
  if(/^most leaves have a large surface area and are thin.*$/i.test(value)) return 'Leaf adaptations for photosynthesis';
  if(/^the leaf of a dicotyledonous plant:.*$/i.test(value)) return 'Leaf structures';
  if(/^the breathing system:.*$/i.test(value)) return 'Breathing system structures';
  if(/^in general, sound travels faster in solids than in liquids and faster in liquids than in gases.*$/i.test(value)) return 'Speed of sound in different media';
  if(/^(?:the\s+)?construction of a simple transformer with a soft-iron core\b.*$/i.test(value)) return 'Transformer construction';
  if(/^(?:how\s+the\s+)?types? of radiation emitted and the half-life of an isotope determine.*$/i.test(value)) return 'Radiation type, half-life and uses';
  if(/^(?:and\s+)?state the factors affecting the rate of population growth for a population of an organism.*$/i.test(value)) return 'Factors affecting population growth';
  if(/^identify,?\s*in diagrams and images,?\s*the main blood vessels to and from the liver as:.*$/i.test(value)) return 'Blood vessels to and from the liver';
  if(/^to use a test cross to identify an unknown genotype.*$/i.test(value)) return 'Test cross';
  if(/^draw, describe and interpret pyramids of energy.*$/i.test(value)) return 'Pyramids of energy';
  if(/^in terms of structure and bonding the properties of simple molecular compounds.*$/i.test(value)) return 'Properties of simple molecular substances';
  if(/^(?:an?\s+)?endothermic reaction takes in thermal energy from the surroundings.*$/i.test(value)) return 'Endothermic reactions';
  if(/^separation and purification techniques, given information about the substances involved$/i.test(value)) return 'Separation and purification techniques';
  if(/^oxides of nitrogen form in car engines.*$/i.test(value)) return 'Oxides of nitrogen and catalytic converters';
  if(/^in a substitution reaction one atom or group of atoms.*$/i.test(value)) return 'Substitution reactions';
  if(/^draw the structure of proteins as:.*$/i.test(value)) return 'Protein structure';
  if(/^label reaction pathway diagrams for exothermic and endothermic reactions$/i.test(value)) return 'Reaction pathway diagrams';
  if(/^(?:the\s+)?hydrogen ion concentration, neutrality, relative acidity and relative alkalinity$/i.test(value)) return 'pH and acidity';
  if(/^compare hydrogen ion concentration, neutrality, relative acidity and relative alkalinity.*$/i.test(value)) return 'pH and acidity';
  if(/^(?:an?\s+)?order of reactivity from a given set of experimental results.*$/i.test(value)) return 'Reactivity order from experimental results';
  if(/^(?:and\s+draw the\s+following parts of an\s+|the\s+following parts of an\s+)?insect[-‑–]pollinated flower:.*$/i.test(value)) return 'Parts of an insect-pollinated flower';
  if(/^(?:the\s+)?potential effects of self[-‑–]pollination and cross[-‑–]pollination on a population.*$/i.test(value)) return 'Effects of self- and cross-pollination';
  if(/^(?:the\s+)?limiting factors of photosynthesis in different environmental conditions$/i.test(value)) return 'Limiting factors of photosynthesis';
  if(/^(?:the\s+)?structure of proteins as:.*$/i.test(value)) return 'Protein structure';
  if(/^proteins as:.*$/i.test(value)) return 'Protein structure';
  if(/^of the skin:.*$/i.test(value)) return 'Skin structures in thermoregulation';
  if(/^(?:an?\s+)?exothermic reaction transfers thermal energy to the surroundings.*$/i.test(value)) return 'Exothermic reactions';

  value = value
    .replace(/\bcontinued\b/ig, '')
    .replace(/\s*;\s*recall and use the equations?\b.*$/i, '')
    .replace(/\s*;\s*recall and use the equation\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const enumeratedLabelMatch = value.match(/^(.*?):\s*(?:\([a-zα-ω]\)|[a-zα-ω]\))/i);
  if(enumeratedLabelMatch && enumeratedLabelMatch[1]){
    value = enumeratedLabelMatch[1].trim();
  }

  const equationLabel = extractEquationLabel(value);
  if(equationLabel) return equationLabel;

  const mappedConceptLabel = matchSyllabusConceptLabel(value);
  if(mappedConceptLabel) return mappedConceptLabel;

  value = value
    .replace(/^,\s*/, '')
    .replace(/^that\s+/i, '')
    .replace(/\s*;\s.*$/, '')
    .replace(/\s*,\s*(including|limited to|such as|e\.g\.|where|which)\b.*$/i, '')
    .replace(/\s+and\s+(give|choose|calculate|explain|apply|identify|know|use|relate|show|determine)\b.*$/i, '')
    .replace(/\s+\b(with reference to|in terms of|using|without|where|which|when|through)\b.*$/i, '')
    .replace(/\s+\bin order of\b.*$/i, '')
    .replace(/\s+\bto show\b.*$/i, '')
    .replace(/\s+\bto produce\b.*$/i, '')
    .replace(/\s+\bon a parallel beam of light\b.*$/i, '')
    .replace(/\s+\bleading to\b.*$/i, '')
    .replace(/\s+\bfor the action of\b.*$/i, '')
    .replace(/\s+\bof an object\b/i, '')
    .replace(/\s+\bthat are embedded in bone and the gums\b/i, '')
    .replace(/\s+\b(including|involving|because|unless)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  value = value
    .replace(/^(.+?)\s+as\s+.+$/i, '$1')
    .replace(/^word equation for\s+(.+?)\s+as:.*$/i, 'Word equation for $1')
    .replace(/^balanced chemical equation for\s+(.+?)\s+as:.*$/i, 'Balanced equation for $1')
    .replace(/^how to measure\s+(.+)$/i, 'Measuring $1')
    .replace(/^an average value for\s+(.+)$/i, 'Average values for $1')
    .replace(/^the relationship\s+(.+)$/i, '$1')
    .replace(/^practical methods for investigating\s+(.+)$/i, '$1 experiments')
    .replace(/^structures in\s+(.+?):.*$/i, '$1 structures')
    .replace(/^parts of\s+(.+?):.*$/i, '$1 structures')
    .replace(/^components of\s+(.+?)\s+as:.*$/i, 'Components of $1')
    .replace(/^types of\s+(.+?):.*$/i, 'Types of $1')
    .replace(/^the main organs of\s+(.+)$/i, '$1 organs')
    .replace(/^the functions of the organs of\s+(.+)$/i, 'Functions of $1 organs')
    .replace(/^the causes of\s+(.+)$/i, '$1')
    .replace(/^terms for the changes in state between\s+(.+)$/i, 'Changes of state')
    .replace(/^distinguishing properties of\s+(.+)$/i, 'Properties of $1')
    .replace(/^factors affecting\s+(.+)$/i, 'Factors affecting $1')
    .replace(/^construction of\s+(.+)$/i, 'Construction of $1')
    .replace(/^difference between\s+(.+)$/i, 'Difference between $1')
    .replace(/^differences between\s+(.+)$/i, 'Differences between $1')
    .replace(/^(.+?)\s+may produce changes in\s+(.+)$/i, 'Changes in $2')
    .replace(/^(.+?)\s+increases the surface area of\s+(.+)$/i, 'Surface area of $2')
    .replace(/^(.+?)\s+is the breakdown of\s+(.+)$/i, 'Breakdown of $2')
    .replace(/^solid friction\b.*$/i, 'Solid friction')
    .replace(/^friction \(drag\)\s+acts on\b.*$/i, 'Friction and drag')
    .replace(/^moment of a force\b.*$/i, 'Moment of a force')
    .replace(/^moments?\s+to\s+situations?.*$/i, 'Principle of moments')
    .replace(/^there is no resultant force and no resultant moment\b.*$/i, 'Equilibrium')
    .replace(/^determine the position of\s+(.+?)\s+of an\b.*$/i, 'Position of $1')
    .replace(/^(?:the\s+)?effect of the position of\s+(.+?)\s+on\b.*$/i, '$1 and stability')
    .replace(/^why\s+(.+?)\s+are important\b.*$/i, 'Importance of $1')
    .replace(/^functions?\s+of\s+(.+)$/i, 'Functions of $1')
    .replace(/^function\s+of\s+(.+)$/i, 'Function of $1')
    .replace(/^role\s+of\s+(.+)$/i, 'Role of $1')
    .replace(/^structure\s+of\s+(.+)$/i, 'Structure of $1')
    .replace(/^types?\s+of\s+(.+)$/i, 'Types of $1')
    .replace(/^position\s+of\s+(.+)$/i, 'Position of $1')
    .replace(/^principle\s+of\s+(.+)$/i, 'Principle of $1')
    .replace(/^conservation\s+of\s+(.+)$/i, 'Conservation of $1')
    .replace(/^pattern and direction of\s+(.+)$/i, 'Pattern of $1')
    .replace(/^effect of changes in\s+(.+?)\s+on\s+(.+)$/i, '$1 effects on $2')
    .replace(/^effect of\s+(.+?)\s+on\s+(.+)$/i, '$1 effect on $2')
    .replace(/^equations?\s+for\s+(.+)$/i, '$1 equation')
    .replace(/^main features used to place\s+(.+)$/i, '$1')
    .replace(/^chemical elements that make up:\s+(.+)$/i, 'Elements in $1')
    .replace(/^experiment\s+to\s+(.+)$/i, 'Experiment: $1')
    .replace(/^from given data or the shape of a\s+(.+?)$/i, '$1')
    .replace(/^speed from the gradient of\s+(.+)$/i, 'Gradient of $1')
    .replace(/^area under a\s+(.+?)\s+to\s+determine.*$/i, 'Area under a $1')
    .replace(/^for a\s+(.+?)\s*,\s*(.+)$/i, '$1 $2')
    .replace(/\s+\b(is|are|may be|may|can|acts?|have|has|increases|decreases)\b.*$/i, '')
    .replace(/^the\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const remappedEquationLabel = extractEquationLabel(value);
  if(remappedEquationLabel) return remappedEquationLabel;

  const remappedConceptLabel = matchSyllabusConceptLabel(value);
  if(remappedConceptLabel) return remappedConceptLabel;

  if(!value){
    value = rawValue
      .replace(/\s*;\s.*$/, '')
      .replace(/\s*,\s*(including|limited to|such as|e\.g\.|where|which)\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if(/^(?:state|describe|explain|recall|know|use|investigate|research|qualitatively|there|what|method|medium|light|image|force|equation|continued|t)$/i.test(value)){
    return '';
  }
  if(/\b(?:of|as|by|with|that)\s*$/i.test(value) && value.split(/\s+/).length <= 6){
    return '';
  }

  return formatSyllabusLabel(value);
}

function buildSyllabusTopicDetails(leafTopic){
  const parentCode = String(leafTopic && leafTopic.code ? leafTopic.code : '').trim();
  const rawItems = splitEmbeddedSyllabusSubtopics(leafTopic && leafTopic.subtopics);
  if(!rawItems.length) return [];

  const details = [];
  let currentGroup = null;
  let groupIndex = 0;
  let lastBulletNumber = null;
  const rootSeen = new Set();

  const syncGroupIndex = (code) => {
    if(!parentCode || !code || !code.startsWith(`${parentCode}.`)) return;
    const suffix = code.slice(parentCode.length + 1).split('.')[0];
    const value = Number(suffix);
    if(Number.isInteger(value) && value > groupIndex){
      groupIndex = value;
    }
  };

  const createGroup = (code, title) => {
    const group = {
      kind: 'group',
      code: code || '',
      title,
      items: [],
      seen: new Set()
    };
    details.push(group);
    currentGroup = group;
    return group;
  };

  const pushBullet = (label) => {
    if(!label) return;
    if(currentGroup){
      if(currentGroup.seen.has(label)) return;
      currentGroup.seen.add(label);
      currentGroup.items.push({title: label});
      return;
    }
    if(rootSeen.has(label)) return;
    rootSeen.add(label);
    details.push({kind: 'bullet', title: label});
  };

  rawItems.forEach((item) => {
    const heading = parseSyllabusHeading(item, '');
    const isNestedHeading = Boolean(
      heading.code &&
      parentCode &&
      heading.code.startsWith(`${parentCode}.`) &&
      heading.code.split('.').length > parentCode.split('.').length
    );

    if(isNestedHeading){
      syncGroupIndex(heading.code);
      createGroup(heading.code, heading.label || heading.code);
      lastBulletNumber = null;
      return;
    }

    const bulletMatch = item.match(/^(\d+)\s+(.*)$/);
    const bulletNumber = bulletMatch ? Number(bulletMatch[1]) : null;
    const shortLabel = compactSyllabusPointLabel(bulletMatch ? bulletMatch[2] : item);
    if(!shortLabel) return;

    if(currentGroup && bulletNumber !== null && lastBulletNumber !== null && bulletNumber <= lastBulletNumber){
      groupIndex += 1;
      const implicitCode = parentCode ? `${parentCode}.${groupIndex}` : '';
      createGroup(implicitCode, shortLabel);
      lastBulletNumber = bulletNumber;
      return;
    }

    pushBullet(shortLabel);
    lastBulletNumber = bulletNumber;
  });

  return details.map((item) => (
    item && item.kind === 'group'
      ? {
        kind: 'group',
        code: item.code,
        title: item.title,
        items: item.items
      }
      : item
  ));
}

function prepareSyllabusLevels(data){
  const mapLeafTopics = (topics, sectionId) => {
    if(!Array.isArray(topics)) return [];
    return topics.map((topic, index) => {
      if(typeof topic === 'string'){
        const heading = parseSyllabusHeading(topic, `Topic ${index + 1}`);
        return {
          id: `${sectionId}-topic-${index + 1}`,
          title: heading.label,
          code: heading.code,
          subtopics: []
        };
      }

      const topicId = String(topic && topic.id ? topic.id : `${sectionId}-topic-${index + 1}`);
      const title = normalizeSyllabusTitle(topic && topic.title, `Topic ${index + 1}`);
      const heading = parseSyllabusHeading(title, `Topic ${index + 1}`);
      const subtopics = Array.isArray(topic && topic.subtopics)
        ? topic.subtopics.map(normalizeSyllabusSubtopicText).filter(Boolean)
        : [];

      return {
        id: topicId,
        title: heading.label,
        code: heading.code,
        subtopics
      };
    });
  };

  const mapUnits = (units) => {
    if(!Array.isArray(units)) return [];
    return units.map((unit, index) => {
      const sectionId = String(unit && unit.id ? unit.id : `section-${index + 1}`);
      return {
        id: sectionId,
        title: normalizeSyllabusTitle(unit && unit.title, `Section ${index + 1}`),
        topics: mapLeafTopics(unit && unit.topics, sectionId)
      };
    });
  };

  const serialiseUnits = (units) => JSON.stringify(
    units.map((section) => ({
      title: section.title,
      topics: Array.isArray(section.topics)
        ? section.topics.map((topic) => ({
          code: topic.code || '',
          title: topic.title,
          subtopics: Array.isArray(topic.subtopics) ? topic.subtopics : []
        }))
        : []
    }))
  );

  const foundation = mapUnits(
    Array.isArray(data && data.core) && data.core.length
      ? data.core
      : (Array.isArray(data && data.units) && data.units.length
        ? data.units
        : (Array.isArray(data && data.extended) ? data.extended : []))
  );

  const advancedCandidate = mapUnits(
    Array.isArray(data && data.extended) && data.extended.length
      ? data.extended
      : (Array.isArray(data && data.advanced) ? data.advanced : [])
  );

  const hasDistinctLevels = Boolean(
    foundation.length &&
    advancedCandidate.length &&
    serialiseUnits(foundation) !== serialiseUnits(advancedCandidate)
  );

  return {
    foundation,
    advanced: hasDistinctLevels ? advancedCandidate : [],
    hasDistinctLevels
  };
}

const SYLLABUS_ZIP_CSS_PATH = '/assets/syllabus-zip/styles/index-DYkgcpNz.css';
let syllabusZipCssPromise = null;

function loadSyllabusZipCss(){
  if(!syllabusZipCssPromise){
    syllabusZipCssPromise = fetch(SYLLABUS_ZIP_CSS_PATH, {cache:'no-store'})
      .then(res => {
        if(!res.ok) throw new Error('Syllabus ZIP CSS not found');
        return res.text();
      });
  }
  return syllabusZipCssPromise;
}

function escapeHtml(value){
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const IGCSEFY_SETTINGS_STORAGE_KEY = 'igcsefy-settings';
const IGCSEFY_LAST_SUBJECT_TAB_STORAGE_KEY = 'igcsefy-last-subject-tab';

function normalizeSubjectDestination(value){
  const normalized = String(value || '').trim().toLowerCase();
  if(normalized === 'past-papers' || normalized === 'pastpapers' || normalized === 'tab-pp'){
    return 'past-papers';
  }
  return 'syllabus';
}

function subjectSupportsPastPapers(subjectSlug){
  const normalized = String(subjectSlug || '').trim().toLowerCase();
  if(!normalized){
    return true;
  }
  if(typeof window !== 'undefined' && typeof window.igcsefyHasPastPapersForSubject === 'function'){
    try{
      return window.igcsefyHasPastPapersForSubject(normalized) !== false;
    }catch(error){}
  }
  return true;
}

function resolveSupportedSubjectDestination(value, subjectSlug){
  const destination = normalizeSubjectDestination(value);
  if(destination === 'past-papers' && !subjectSupportsPastPapers(subjectSlug)){
    return 'syllabus';
  }
  return destination;
}

function getSubjectPanelIdForDestination(tab){
  return normalizeSubjectDestination(tab) === 'past-papers' ? 'tab-pp' : 'tab-syl';
}

function getSubjectDestinationForPanelId(panelId){
  return String(panelId || '').trim().toLowerCase() === 'tab-pp' ? 'past-papers' : 'syllabus';
}

function readStoredJson(key, fallback){
  if(typeof window === 'undefined' || !window.localStorage){
    return fallback;
  }
  try{
    const raw = window.localStorage.getItem(key);
    if(!raw) return fallback;
    return JSON.parse(raw);
  }catch(error){
    return fallback;
  }
}

function readStudyPreferences(){
  const settings = readStoredJson(IGCSEFY_SETTINGS_STORAGE_KEY, null);
  const prefs = settings && settings.studyPreferences && typeof settings.studyPreferences === 'object'
    ? settings.studyPreferences
    : {};
  return {
    defaultSubjectDestination: normalizeSubjectDestination(prefs.defaultSubjectDestination),
    rememberLastSubjectTab: prefs.rememberLastSubjectTab !== false
  };
}

function readLastSubjectDestination(){
  if(typeof window === 'undefined' || !window.localStorage){
    return '';
  }
  try{
    const raw = window.localStorage.getItem(IGCSEFY_LAST_SUBJECT_TAB_STORAGE_KEY);
    return raw ? normalizeSubjectDestination(raw) : '';
  }catch(error){
    return '';
  }
}

function rememberLastSubjectDestination(tab){
  if(typeof window === 'undefined' || !window.localStorage){
    return;
  }
  try{
    window.localStorage.setItem(
      IGCSEFY_LAST_SUBJECT_TAB_STORAGE_KEY,
      normalizeSubjectDestination(tab)
    );
  }catch(error){}
}

function resolveInitialSubjectDestination(locationIntent, subjectSlug){
  const intent = locationIntent || {};
  if(intent.explicitTab){
    return resolveSupportedSubjectDestination(intent.explicitTab, subjectSlug);
  }
  if(intent.hasSyllabusIntent){
    return 'syllabus';
  }
  const preferences = readStudyPreferences();
  if(preferences.rememberLastSubjectTab){
    const remembered = readLastSubjectDestination();
    if(remembered){
      return resolveSupportedSubjectDestination(remembered, subjectSlug);
    }
  }
  return resolveSupportedSubjectDestination(preferences.defaultSubjectDestination, subjectSlug);
}

function getActiveSubjectTabId(tabsRoot){
  if(!tabsRoot) return '';
  const activeTab = tabsRoot.querySelector('[role="tab"][aria-selected="true"]');
  return activeTab ? String(activeTab.getAttribute('aria-controls') || '') : '';
}

function notifySubjectTabChange(tabsRoot, panelId){
  if(!tabsRoot || !panelId) return;
  rememberLastSubjectDestination(getSubjectDestinationForPanelId(panelId));
  try{
    tabsRoot.dispatchEvent(new CustomEvent('igcsefy:subject-tab-change', {
      detail: { panelId }
    }));
  }catch(error){}
}

function setActiveSubjectTab(tabsRoot, panelId){
  if(!tabsRoot || !panelId) return;
  const target = tabsRoot.querySelector(`[role="tab"][aria-controls="${panelId}"]`);
  if(!target) return;
  if(getActiveSubjectTabId(tabsRoot) === panelId){
    notifySubjectTabChange(tabsRoot, panelId);
    return;
  }
  tabsRoot.querySelectorAll('[role="tab"]').forEach(tab=>{
    tab.setAttribute('aria-selected', tab === target ? 'true' : 'false');
  });
  tabsRoot.querySelectorAll('[role="tabpanel"]').forEach(panel=>{
    panel.setAttribute('aria-hidden', panel.id === panelId ? 'false' : 'true');
  });
  notifySubjectTabChange(tabsRoot, panelId);
}

function setupSubjectSyllabusZipContext(containerEl){
  const tabsRoot = containerEl.closest('[data-tabs]');
  if(!tabsRoot) return null;

  document.body.classList.add('subject-syllabus-zip');

  const hero = document.querySelector('main .hero');
  if(hero){
    hero.classList.add('subject-hero-hidden');
  }

  const tabList = tabsRoot.querySelector('.tabs[role="tablist"]');
  const syncNativeTabsVisibility = () => {
    if(!tabList) return;
    if(tabList.style.display !== 'none'){
      tabList.style.display = 'none';
    }
  };

  syncNativeTabsVisibility();

  return {
    tabsRoot,
    syncNativeTabsVisibility
  };
}

function renderChevronIcon(direction, className){
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('xmlns', ns);
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', className);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', direction === 'down' ? 'm6 9 6 6 6-6' : 'm9 18 6-6-6-6');
  svg.appendChild(path);
  return svg;
}

function waitForTabPanelVisible(element, callback){
  const panel = element && element.closest('[role="tabpanel"]');
  if(!panel || panel.getAttribute('aria-hidden') !== 'true'){
    callback();
    return;
  }
  let done = false;
  const finish = () => {
    if(done || panel.getAttribute('aria-hidden') === 'true') return;
    done = true;
    observer.disconnect();
    callback();
  };
  const observer = new MutationObserver(() => {
    requestAnimationFrame(finish);
  });
  observer.observe(panel, { attributes: true, attributeFilter: ['aria-hidden'] });
}

function buildZipTopics(levelItems){
  return levelItems.map((section, index) => {
    const baseId = String(section.id || `section-${index + 1}`);
    const topics = Array.isArray(section.topics) ? section.topics : [];
    return {
      id: `${baseId}-${index + 1}`,
      sectionId: baseId,
      name: String(section.title || `Section ${index + 1}`),
      topicCount: topics.length,
      topics
    };
  });
}

function readSubjectNavigationIntent(){
  if(typeof window === 'undefined'){
    return {
      tab: 'syllabus',
      explicitTab: '',
      level: 'core',
      sectionId: '',
      topicId: '',
      hasSyllabusIntent: false
    };
  }

  const params = new URLSearchParams(window.location.search || '');
  const topicKey = String(params.get('topicKey') || '').trim();
  const parts = topicKey ? topicKey.split('::') : [];
  const level = String(params.get('level') || parts[1] || '').trim().toLowerCase();
  const sectionId = String(params.get('section') || parts[2] || '').trim();
  const topicId = String(params.get('topic') || parts[3] || '').trim();
  const tabValue = String(params.get('tab') || params.get('view') || '').trim().toLowerCase();
  const explicitTab = tabValue === 'past-papers' || tabValue === 'syllabus'
    ? tabValue
    : '';
  const hasSyllabusIntent = !!(
    topicKey ||
    params.has('level') ||
    params.has('section') ||
    params.has('topic')
  );

  return {
    tab: explicitTab || 'syllabus',
    explicitTab,
    level: level === 'extended' ? 'extended' : 'core',
    sectionId,
    topicId,
    hasSyllabusIntent
  };
}

function renderSyllabusBootShell(root, subjectMeta){
  const meta = subjectMeta || { name: 'Subject', code: '' };
  const rows = Array.from({length: 8}, (_, index) => {
    const lineWidths = ['28%', '34%', '30%', '24%', '32%', '26%', '31%', '22%'];
    const countWidths = ['4.5rem', '5rem', '4.25rem', '4.75rem', '4rem', '4.5rem', '4.75rem', '4.25rem'];
    return `
      <div class="syllabus-boot-shell__row">
        <div class="syllabus-boot-shell__row-left">
          <span class="syllabus-boot-shell__index">${String(index + 1).padStart(2, '0')}</span>
          <span class="syllabus-boot-shell__dot"></span>
          <span class="syllabus-boot-shell__line" style="width:${lineWidths[index % lineWidths.length]}"></span>
        </div>
        <div class="syllabus-boot-shell__row-right">
          <span class="syllabus-boot-shell__count" style="width:${countWidths[index % countWidths.length]}"></span>
          <span class="syllabus-boot-shell__chevron"></span>
        </div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <style data-syllabus-boot>
      .syllabus-boot-shell{
        min-height:100vh;
        background:#0A0A0B;
        color:#fff;
        opacity:0;
        animation:syllabusBootShellFadeIn 180ms ease forwards;
      }
      @keyframes syllabusBootShellFadeIn{
        from{ opacity:0; }
        to{ opacity:1; }
      }
      .syllabus-boot-shell__header{
        border-bottom:1px solid rgba(255,255,255,.06);
      }
      .syllabus-boot-shell__inner{
        width:100%;
        max-width:56rem;
        margin:0 auto;
        padding:0 1.5rem;
      }
      .syllabus-boot-shell__header .syllabus-boot-shell__inner{
        padding-top:2rem;
        padding-bottom:2rem;
      }
      .syllabus-boot-shell__crumb{
        margin:0 0 1.25rem;
        display:flex;
        align-items:center;
        gap:.5rem;
        font-size:.875rem;
        color:rgba(255,255,255,.3);
      }
      .syllabus-boot-shell__crumb-current{
        color:rgba(255,255,255,.6);
      }
      .syllabus-boot-shell__head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:1rem;
        flex-wrap:wrap;
      }
      .syllabus-boot-shell__meta{
        min-width:min(100%,24rem);
      }
      .syllabus-boot-shell__title{
        margin:0;
        font-size:1.5rem;
        line-height:2rem;
        letter-spacing:-.025em;
        font-weight:600;
      }
      .syllabus-boot-shell__subtitle{
        margin:.25rem 0 0;
        font-size:.875rem;
        color:rgba(255,255,255,.4);
      }
      .syllabus-boot-shell__tabs{
        display:flex;
        gap:.25rem;
        padding:.25rem;
        border-radius:9999px;
        background:rgba(255,255,255,.05);
      }
      .syllabus-boot-shell__tab{
        min-height:auto;
        padding:.5rem 1.25rem;
        border-radius:9999px;
        font-size:.875rem;
        font-weight:500;
        line-height:1.25rem;
      }
      .syllabus-boot-shell__tab.is-active{
        background:#fff;
        color:#000;
        box-shadow:0 1px 3px rgba(0,0,0,.1);
      }
      .syllabus-boot-shell__tab:not(.is-active){
        color:rgba(255,255,255,.5);
      }
      .syllabus-boot-shell__body{
        padding:2rem 1.5rem 4rem;
      }
      .syllabus-boot-shell__section-row{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:1rem;
        flex-wrap:wrap;
      }
      .syllabus-boot-shell__levels{
        display:flex;
        gap:.25rem;
        padding:.25rem;
        border-radius:9999px;
        background:rgba(255,255,255,.05);
      }
      .syllabus-boot-shell__level{
        min-height:auto;
        padding:.5rem 1.25rem;
        border-radius:9999px;
        font-size:.875rem;
        font-weight:500;
        line-height:1.25rem;
      }
      .syllabus-boot-shell__level.is-active{
        background:#fff;
        color:#000;
      }
      .syllabus-boot-shell__level:not(.is-active){
        color:rgba(255,255,255,.5);
      }
      .syllabus-boot-shell__note{
        margin:0;
        padding-top:.375rem;
        font-size:.75rem;
        color:rgba(255,255,255,.25);
      }
      .syllabus-boot-shell__content{
        margin-top:2rem;
      }
      .syllabus-boot-shell__row{
        height:4.5rem;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:1rem;
        border-top:1px solid rgba(255,255,255,.05);
      }
      .syllabus-boot-shell__row-left,
      .syllabus-boot-shell__row-right{
        display:flex;
        align-items:center;
        gap:1rem;
      }
      .syllabus-boot-shell__index{
        min-width:1.5rem;
        font-variant-numeric:tabular-nums;
        font-size:.75rem;
        color:rgba(255,255,255,.22);
      }
      .syllabus-boot-shell__dot{
        width:.5rem;
        height:.5rem;
        border-radius:9999px;
        background:rgba(255,255,255,.14);
      }
      .syllabus-boot-shell__line,
      .syllabus-boot-shell__count{
        display:block;
        height:.875rem;
        border-radius:9999px;
        background:rgba(255,255,255,.08);
      }
      .syllabus-boot-shell__line{
        max-width:min(20rem,42vw);
      }
      .syllabus-boot-shell__count{
        min-width:4rem;
      }
      .syllabus-boot-shell__chevron{
        width:.5rem;
        height:.5rem;
        border-top:1.5px solid rgba(255,255,255,.18);
        border-right:1.5px solid rgba(255,255,255,.18);
        transform:rotate(45deg);
      }
      @media (max-width:640px){
        .syllabus-boot-shell__inner{
          padding:0 1rem;
        }
        .syllabus-boot-shell__header .syllabus-boot-shell__inner{
          padding-top:1.5rem;
          padding-bottom:1.5rem;
        }
        .syllabus-boot-shell__body{
          padding:1.5rem 1rem 3rem;
        }
        .syllabus-boot-shell__row{
          height:4rem;
        }
      }
      html.light .syllabus-boot-shell{
        background:#F1EFE7;
        color:#000000;
      }
      html.light .syllabus-boot-shell__header{
        border-bottom-color:#E9E3D8;
      }
      html.light .syllabus-boot-shell__crumb,
      html.light .syllabus-boot-shell__subtitle,
      html.light .syllabus-boot-shell__note,
      html.light .syllabus-boot-shell__index{
        color:#666666;
      }
      html.light .syllabus-boot-shell__crumb-current{
        color:#000000;
      }
      html.light .syllabus-boot-shell__tabs,
      html.light .syllabus-boot-shell__levels{
        background:#FFFFFF;
        box-shadow:0 0 0 1px #E9E3D8 inset;
      }
      html.light .syllabus-boot-shell__tab,
      html.light .syllabus-boot-shell__level{
        color:#666666;
      }
      html.light .syllabus-boot-shell__tab.is-active,
      html.light .syllabus-boot-shell__level.is-active{
        background:#000000;
        color:#FFFFFF;
        box-shadow:none;
      }
      html.light .syllabus-boot-shell__row{
        border-top-color:#E9E3D8;
      }
      html.light .syllabus-boot-shell__dot{
        background:#666666;
      }
      html.light .syllabus-boot-shell__line,
      html.light .syllabus-boot-shell__count{
        background:#E9E3D8;
      }
      html.light .syllabus-boot-shell__chevron{
        border-top-color:#666666;
        border-right-color:#666666;
      }
    </style>
    <div class="syllabus-boot-shell" aria-hidden="true">
      <div class="syllabus-boot-shell__header">
        <div class="syllabus-boot-shell__inner">
          <div class="syllabus-boot-shell__crumb">
            <span>${escapeHtml(meta.name)}</span>
            <span>/</span>
            <span class="syllabus-boot-shell__crumb-current">Syllabus</span>
          </div>
          <div class="syllabus-boot-shell__head">
            <div class="syllabus-boot-shell__meta">
              <h1 class="syllabus-boot-shell__title">${escapeHtml(meta.name)}</h1>
              <p class="syllabus-boot-shell__subtitle">Cambridge IGCSE · ${escapeHtml(meta.code || '')}</p>
            </div>
            <div class="syllabus-boot-shell__tabs">
              <span class="syllabus-boot-shell__tab is-active">Syllabus</span>
              <span class="syllabus-boot-shell__tab">Past Papers</span>
            </div>
          </div>
        </div>
      </div>
      <div class="syllabus-boot-shell__inner syllabus-boot-shell__body">
        <div class="syllabus-boot-shell__section-row">
          <div class="syllabus-boot-shell__levels">
            <span class="syllabus-boot-shell__level is-active">Core</span>
            <span class="syllabus-boot-shell__level">Extended</span>
          </div>
          <p class="syllabus-boot-shell__note">Suitable for all students</p>
        </div>
        <div class="syllabus-boot-shell__content">
          ${rows}
        </div>
      </div>
    </div>
  `;
}

function scheduleSyllabusBootShell(root, subjectMeta, options){
  const config = options && typeof options === 'object'
    ? options
    : { delay: options };
  const safeDelay = typeof config.delay === 'number' ? config.delay : 900;
  const minVisible = typeof config.minVisible === 'number' ? config.minVisible : 180;
  let cancelled = false;
  let timer = 0;
  let shownAt = 0;

  const cancel = () => {
    cancelled = true;
    if(timer){
      clearTimeout(timer);
      timer = 0;
    }
  };

  const settle = () => {
    if(timer){
      clearTimeout(timer);
      timer = 0;
    }
    if(!shownAt) return Promise.resolve();
    const elapsed = (window.performance && typeof window.performance.now === 'function')
      ? window.performance.now() - shownAt
      : minVisible;
    if(elapsed >= minVisible) return Promise.resolve();
    return new Promise((resolve) => {
      window.setTimeout(resolve, minVisible - elapsed);
    });
  };

  timer = window.setTimeout(() => {
    timer = 0;
    if(cancelled) return;
    renderSyllabusBootShell(root, subjectMeta);
    shownAt = (window.performance && typeof window.performance.now === 'function')
      ? window.performance.now()
      : Date.now();
  }, safeDelay);

  return { cancel, settle };
}

async function renderSyllabus(root, data, subjectMeta, zipContext, preloadedCssText){
  root.innerHTML = '';
  if(root.__igcsefySyllabusThemeObserver){
    root.__igcsefySyllabusThemeObserver.disconnect();
    root.__igcsefySyllabusThemeObserver = null;
  }

  const dataStore = ensureIgcsefyDataStore();
  const locationIntent = readSubjectNavigationIntent();
  const subjectRef = {
    code: subjectMeta && subjectMeta.code ? subjectMeta.code : '',
    slug: subjectMeta && subjectMeta.slug ? subjectMeta.slug : ''
  };
  const initialSubjectDestination = resolveInitialSubjectDestination(locationIntent, subjectRef.slug);
  const levels = prepareSyllabusLevels(data || {});
  const topicsByLevel = {
    core: buildZipTopics(levels.foundation || []),
    extended: buildZipTopics(levels.advanced || [])
  };
  const preferredLevel = dataStore.getSubjectLevel(subjectRef, 'core');
  const state = {
    activeLevel: levels.hasDistinctLevels
      ? (locationIntent.level === 'extended' ? 'extended' : (preferredLevel === 'extended' ? 'extended' : 'core'))
      : 'core',
    openTopicIds: {
      core: new Set(),
      extended: new Set()
    }
  };
  const levelViews = {
    core: null,
    extended: null
  };

  const cssText = preloadedCssText || await loadSyllabusZipCss();
  const host = document.createElement('div');
  host.className = 'syllabus-zip-host';
  root.appendChild(host);
  let shell = null;
  let topSyllabusButton = null;
  let topPastPapersButton = null;
  function resolveShellTheme(){
    const docRoot = document.documentElement;
    return docRoot.dataset.theme === 'light'
      || docRoot.classList.contains('light')
      || (!docRoot.classList.contains('dark') && docRoot.dataset.theme !== 'dark')
      ? 'light'
      : 'dark';
  }
  const syncHostTheme = () => {
    const resolvedTheme = resolveShellTheme();
    host.dataset.theme = resolvedTheme;
    if(shell){
      shell.dataset.theme = resolvedTheme;
      applyShellTabVisualState();
    }
  };
  syncHostTheme();
  const themeObserver = new MutationObserver(syncHostTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme']
  });
  root.__igcsefySyllabusThemeObserver = themeObserver;
  const shadow = host.attachShadow({mode: 'open'});

  shadow.innerHTML = `
    <style>
      ${cssText}
      .subject-section-shell{
        --ig-jump-text: rgba(255,255,255,.97);
        --ig-jump-text-soft: rgba(255,255,255,.7);
        --ig-jump-glow: 0 0 14px rgba(255,255,255,.12);
        --ig-jump-glow-soft: 0 0 12px rgba(255,255,255,.08);
        --ig-jump-duration: 2800ms;
        --ig-surface-motion: 220ms cubic-bezier(.22, 1, .36, 1);
        --ig-panel-motion: 320ms cubic-bezier(.22, 1, .36, 1);
        min-height:100vh;
        background:#0A0A0B;
        color:#fff;
      }
      .subject-section-shell__header{
        border-bottom:1px solid rgba(255,255,255,.06);
      }
      .subject-section-shell__inner{
        width:100%;
        max-width:56rem;
        margin:0 auto;
        padding:0 1.5rem;
      }
      .subject-section-shell__header .subject-section-shell__inner{
        padding-top:2rem;
        padding-bottom:2rem;
      }
      .subject-section-shell__body{
        padding-top:2rem;
        padding-bottom:4rem;
      }
      .subject-section-shell__crumb{
        margin:0 0 1.25rem;
        display:flex;
        align-items:center;
        gap:.5rem;
        font-size:.875rem;
        color:rgba(255,255,255,.3);
        letter-spacing:.01em;
      }
      .subject-section-shell__crumb-current{
        color:rgba(255,255,255,.6);
      }
      .subject-section-shell__head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        flex-wrap:wrap;
        gap:1rem;
      }
      .subject-section-shell__meta{
        min-width:min(100%,24rem);
      }
      .subject-section-shell__title{
        margin:0;
        font-size:1.5rem;
        line-height:2rem;
        letter-spacing:-.025em;
        font-weight:600;
      }
      .subject-section-shell__subtitle{
        margin:.25rem 0 0;
        font-size:.875rem;
        color:rgba(255,255,255,.4);
      }
      .subject-section-shell__tabs{
        display:flex;
        gap:.25rem;
        padding:.25rem;
        border-radius:9999px;
        background:rgba(255,255,255,.05);
      }
      .subject-section-shell__tab{
        appearance:none;
        min-height:auto;
        padding:.5rem 1.25rem;
        border:0;
        border-radius:9999px;
        background:transparent;
        color:rgba(255,255,255,.5);
        font:inherit;
        font-size:.875rem;
        font-weight:500;
        line-height:1.25rem;
        transition:
          background-color .2s ease,
          color .2s ease,
          box-shadow .2s ease;
      }
      .subject-section-shell__tab:hover{
        color:rgba(255,255,255,.8);
      }
      .subject-section-shell__tab.is-active{
        background:#fff;
        color:#000;
        box-shadow:0 1px 3px rgba(0,0,0,.1);
      }
      .subject-section-shell__section-row{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        flex-wrap:wrap;
        gap:1rem;
      }
      [data-role="level-switch"]{
        display:flex;
        gap:.25rem;
        padding:.25rem;
        border-radius:9999px;
        background:rgba(255,255,255,.05);
      }
      [data-role="level-switch"] [data-level]{
        appearance:none;
        min-height:auto;
        padding:.5rem 1.25rem;
        border:0;
        border-radius:9999px;
        background:transparent;
        color:rgba(255,255,255,.5);
        font:inherit;
        font-size:.875rem;
        font-weight:500;
        line-height:1.25rem;
        transition:all .2s ease;
      }
      [data-role="level-switch"] [data-level][data-active="true"]{
        background:#FFFFFF;
        color:#000000;
        box-shadow:0 1px 3px rgba(0,0,0,.1);
      }
      [data-role="level-switch"] [data-level][data-active="false"]:hover{
        color:rgba(255,255,255,.8);
      }
      .subject-section-shell__content{
        width:100%;
        margin-top:2rem;
      }
      @media (max-width:640px){
        .subject-section-shell__inner{
          padding:0 1rem;
        }
        .subject-section-shell__header .subject-section-shell__inner{
          padding-top:1.5rem;
          padding-bottom:1.5rem;
        }
      }
      @keyframes igSearchRowTitleLight{
        0%{
          color:#666666;
          text-shadow:0 0 0 rgba(0,0,0,0);
        }
        14%{
          color:#000000;
          text-shadow:0 0 6px rgba(0,0,0,.03);
        }
        30%{
          color:var(--ig-jump-text);
          text-shadow:0 0 10px rgba(0,0,0,.08);
        }
        76%{
          color:var(--ig-jump-text);
          text-shadow:var(--ig-jump-glow);
        }
        100%{
          color:#666666;
          text-shadow:0 0 0 rgba(0,0,0,0);
        }
      }
      @keyframes igSearchLineTitleLight{
        0%{
          color:#666666;
          text-shadow:0 0 0 rgba(0,0,0,0);
        }
        14%{
          color:#000000;
          text-shadow:0 0 6px rgba(0,0,0,.03);
        }
        30%{
          color:#000000;
          text-shadow:0 0 9px rgba(0,0,0,.07);
        }
        76%{
          color:var(--ig-jump-text);
          text-shadow:var(--ig-jump-glow);
        }
        100%{
          color:#666666;
          text-shadow:0 0 0 rgba(0,0,0,0);
        }
      }
      @keyframes igSearchLineCodeLight{
        0%{
          color:#666666;
          text-shadow:0 0 0 rgba(0,0,0,0);
        }
        14%{
          color:#666666;
          text-shadow:0 0 5px rgba(0,0,0,.02);
        }
        30%{
          color:#666666;
          text-shadow:0 0 8px rgba(0,0,0,.05);
        }
        76%{
          color:var(--ig-jump-text-soft);
          text-shadow:var(--ig-jump-glow-soft);
        }
        100%{
          color:#666666;
          text-shadow:0 0 0 rgba(0,0,0,0);
        }
      }
      :host([data-theme="light"]) .subject-section-shell,
      :host-context(html.light) .subject-section-shell{
        --ig-jump-text:#000000;
        --ig-jump-text-soft:#666666;
        --ig-jump-glow:0 0 14px rgba(0,0,0,.08);
        --ig-jump-glow-soft:0 0 12px rgba(0,0,0,.05);
        background:#F1EFE7;
        color:#000000;
      }
      :host([data-theme="light"]) .subject-section-shell__header,
      :host-context(html.light) .subject-section-shell__header{
        border-bottom-color:#E9E3D8;
      }
      :host([data-theme="light"]) [data-role="level-switch"],
      :host-context(html.light) [data-role="level-switch"]{
        background:#FFFFFF;
        box-shadow:0 0 0 1px #E9E3D8 inset;
      }
      .subject-section-shell[data-theme="light"] [data-role="level-switch"]{
        background:#FFFFFF !important;
        box-shadow:0 0 0 1px #E9E3D8 inset;
      }
      :host([data-theme="light"]) [data-role="level-switch"] [data-level][data-active="true"],
      :host-context(html.light) [data-role="level-switch"] [data-level][data-active="true"]{
        background:#000000;
        color:#FFFFFF;
        box-shadow:none;
      }
      .subject-section-shell[data-theme="light"] [data-role="level-switch"] [data-level][data-active="true"]{
        background:#000000 !important;
        color:#FFFFFF !important;
        box-shadow:none;
      }
      :host([data-theme="light"]) [data-role="level-switch"] [data-level][data-active="false"],
      :host-context(html.light) [data-role="level-switch"] [data-level][data-active="false"]{
        color:#666666;
      }
      .subject-section-shell[data-theme="light"] [data-role="level-switch"] [data-level][data-active="false"]{
        color:#666666 !important;
      }
      :host([data-theme="light"]) [data-role="level-switch"] [data-level][data-active="false"]:hover,
      :host-context(html.light) [data-role="level-switch"] [data-level][data-active="false"]:hover{
        color:#000000;
      }
      .subject-section-shell[data-theme="light"] [data-role="level-switch"] [data-level][data-active="false"]:hover{
        color:#000000 !important;
      }
      :host([data-theme="light"]) [data-role="level-note"],
      :host([data-theme="light"]) [data-role="level-label"],
      :host([data-theme="light"]) [data-role="level-count"],
      :host-context(html.light) [data-role="level-note"],
      :host-context(html.light) [data-role="level-label"],
      :host-context(html.light) [data-role="level-count"]{
        color:#666666;
      }
      :host([data-theme="light"]) [data-role="level-summary"] .flex-1,
      :host-context(html.light) [data-role="level-summary"] .flex-1{
        background:#E9E3D8;
      }
      :host([data-theme="light"]) .subject-section-shell__crumb,
      :host([data-theme="light"]) .subject-section-shell__subtitle,
      :host([data-theme="light"]) .sv-topic-title-text,
      :host([data-theme="light"]) .sv-topic-count-text,
      :host([data-theme="light"]) .sv-topic-chevron,
      :host([data-theme="light"]) .sv-topic-line__code,
      :host([data-theme="light"]) .sv-topic-line__bullet,
      :host([data-theme="light"]) .sv-topic-line__title,
      :host([data-theme="light"]) .sv-topic-detail-group__code,
      :host([data-theme="light"]) .sv-topic-detail-group__title,
      :host([data-theme="light"]) .sv-topic-detail-bullet__dot,
      :host([data-theme="light"]) .sv-topic-detail-bullet__title,
      :host-context(html.light) .subject-section-shell__crumb,
      :host-context(html.light) .subject-section-shell__subtitle,
      :host-context(html.light) .sv-topic-title-text,
      :host-context(html.light) .sv-topic-count-text,
      :host-context(html.light) .sv-topic-chevron,
      :host-context(html.light) .sv-topic-line__code,
      :host-context(html.light) .sv-topic-line__bullet,
      :host-context(html.light) .sv-topic-line__title,
      :host-context(html.light) .sv-topic-detail-group__code,
      :host-context(html.light) .sv-topic-detail-group__title,
      :host-context(html.light) .sv-topic-detail-bullet__dot,
      :host-context(html.light) .sv-topic-detail-bullet__title{
        color:#666666;
      }
      :host([data-theme="light"]) .subject-section-shell__crumb-current,
      :host([data-theme="light"]) .subject-section-shell__title,
      :host-context(html.light) .subject-section-shell__crumb-current,
      :host-context(html.light) .subject-section-shell__title{
        color:#000000;
      }
      :host([data-theme="light"]) .subject-section-shell__tabs,
      :host-context(html.light) .subject-section-shell__tabs{
        background:#FFFFFF;
        box-shadow:0 0 0 1px #E9E3D8 inset;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__tabs{
        background:#FFFFFF !important;
        box-shadow:0 0 0 1px #E9E3D8 inset;
      }
      :host([data-theme="light"]) .subject-section-shell__tab,
      :host-context(html.light) .subject-section-shell__tab{
        color:#666666;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__tab{
        color:#666666 !important;
      }
      :host([data-theme="light"]) .subject-section-shell__tab:hover,
      :host-context(html.light) .subject-section-shell__tab:hover{
        color:#000000;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__tab:hover{
        color:#000000 !important;
      }
      :host([data-theme="light"]) .subject-section-shell__tab.is-active,
      :host-context(html.light) .subject-section-shell__tab.is-active{
        background:#000000;
        color:#FFFFFF;
        box-shadow:none;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__tab.is-active{
        background:#000000 !important;
        color:#FFFFFF !important;
        box-shadow:none !important;
      }
      :host([data-theme="light"]) .sv-topic-row-btn[data-open="true"],
      :host-context(html.light) .sv-topic-row-btn[data-open="true"]{
        background:rgba(0,0,0,.03);
      }
      :host([data-theme="light"]) .sv-topic-row-btn[data-open="true"] .sv-topic-title-text,
      :host-context(html.light) .sv-topic-row-btn[data-open="true"] .sv-topic-title-text{
        color:#000000;
      }
      :host([data-theme="light"]) .sv-topic-row-btn[data-open="true"] .sv-topic-count-text,
      :host([data-theme="light"]) .sv-topic-row-btn[data-open="false"]:hover .sv-topic-chevron,
      :host-context(html.light) .sv-topic-row-btn[data-open="true"] .sv-topic-count-text,
      :host-context(html.light) .sv-topic-row-btn[data-open="false"]:hover .sv-topic-chevron{
        color:#666666;
      }
      :host([data-theme="light"]) .sv-topic-indicator,
      :host-context(html.light) .sv-topic-indicator{
        background:#000000;
      }
      :host([data-theme="light"]) .sv-topic-title-text::before,
      :host([data-theme="light"]) .sv-topic-line__code::before,
      :host([data-theme="light"]) .sv-topic-line__title::before,
      :host-context(html.light) .sv-topic-title-text::before,
      :host-context(html.light) .sv-topic-line__code::before,
      :host-context(html.light) .sv-topic-line__title::before{
        background:radial-gradient(ellipse at center, rgba(0,0,0,.1) 0%, rgba(0,0,0,.04) 42%, transparent 74%);
      }
      :host([data-theme="light"]) .sv-topic-row-btn.is-search-section-target .sv-topic-title-text,
      :host-context(html.light) .sv-topic-row-btn.is-search-section-target .sv-topic-title-text{
        animation-name:igSearchRowTitleLight;
      }
      :host([data-theme="light"]) .sv-topic-line.is-search-target .sv-topic-line__code,
      :host-context(html.light) .sv-topic-line.is-search-target .sv-topic-line__code{
        animation-name:igSearchLineCodeLight;
      }
      :host([data-theme="light"]) .sv-topic-line.is-search-target .sv-topic-line__title,
      :host-context(html.light) .sv-topic-line.is-search-target .sv-topic-line__title{
        animation-name:igSearchLineTitleLight;
      }
      :host([data-theme="light"]) .sv-topic-panel-inner,
      :host-context(html.light) .sv-topic-panel-inner{
        border-left-color:#E9E3D8;
        background:#FFFFFF;
      }
      .sv-topic-row-btn[data-open="true"]{
        background: rgba(255,255,255,0.04);
      }
      .sv-topic-row-btn[data-open="true"] .sv-topic-indicator{
        opacity: .62;
      }
      .sv-topic-row-btn[data-open="false"] .sv-topic-indicator{
        opacity: 0;
      }
      .sv-topic-row-btn[data-open="false"]:hover .sv-topic-indicator{
        opacity: .22;
      }
      .sv-topic-row-btn[data-open="true"] .sv-topic-title-text{
        color: rgba(255,255,255,.95);
      }
      .sv-topic-row-btn[data-open="true"] .sv-topic-count-text{
        color: rgba(255,255,255,.58);
      }
      .sv-topic-row-btn[data-open="false"]:hover .sv-topic-chevron{
        color: rgba(255,255,255,.45);
      }
      .sv-topic-row-btn{
        border-radius: 1rem;
        background: transparent;
        transition:
          background-color var(--ig-surface-motion),
          color var(--ig-surface-motion),
          text-shadow var(--ig-surface-motion);
      }
      .sv-topic-title-text,
      .sv-topic-count-text,
      .sv-topic-line__code,
      .sv-topic-line__title{
        display:inline-block;
        position: relative;
        z-index: 0;
        transition:
          color var(--ig-surface-motion),
          text-shadow var(--ig-surface-motion),
          opacity var(--ig-surface-motion);
      }
      .sv-topic-title-text::before,
      .sv-topic-line__code::before,
      .sv-topic-line__title::before{
        content:'';
        position:absolute;
        inset:-.28em -.5em;
        border-radius:999px;
        background:radial-gradient(ellipse at center, rgba(255,255,255,.14) 0%, rgba(255,255,255,.08) 42%, transparent 74%);
        filter:blur(10px);
        opacity:0;
        pointer-events:none;
        transition:opacity 220ms ease;
        z-index:-1;
      }
      @keyframes igSearchSpotlight{
        0%{
          opacity:0;
          transform:scale(.96);
        }
        12%{
          opacity:.08;
          transform:scale(.985);
        }
        28%{
          opacity:.46;
          transform:scale(1);
        }
        44%{
          opacity:.76;
          transform:scale(1.012);
        }
        80%{
          opacity:.66;
          transform:scale(1.018);
        }
        100%{
          opacity:0;
          transform:scale(1.03);
        }
      }
      @keyframes igSearchRowTitle{
        0%{
          color:rgba(255,255,255,.95);
          text-shadow:0 0 0 rgba(255,255,255,0);
        }
        14%{
          color:rgba(255,255,255,.97);
          text-shadow:0 0 6px rgba(255,255,255,.03);
        }
        30%{
          color:var(--ig-jump-text);
          text-shadow:0 0 10px rgba(255,255,255,.08);
        }
        76%{
          color:var(--ig-jump-text);
          text-shadow:var(--ig-jump-glow);
        }
        100%{
          color:rgba(255,255,255,.95);
          text-shadow:0 0 0 rgba(255,255,255,0);
        }
      }
      @keyframes igSearchLineTitle{
        0%{
          color:rgba(255,255,255,.54);
          text-shadow:0 0 0 rgba(255,255,255,0);
        }
        14%{
          color:rgba(255,255,255,.62);
          text-shadow:0 0 6px rgba(255,255,255,.03);
        }
        30%{
          color:rgba(255,255,255,.9);
          text-shadow:0 0 9px rgba(255,255,255,.07);
        }
        76%{
          color:var(--ig-jump-text);
          text-shadow:var(--ig-jump-glow);
        }
        100%{
          color:rgba(255,255,255,.54);
          text-shadow:0 0 0 rgba(255,255,255,0);
        }
      }
      @keyframes igSearchLineCode{
        0%{
          color:rgba(255,255,255,.24);
          text-shadow:0 0 0 rgba(255,255,255,0);
        }
        14%{
          color:rgba(255,255,255,.34);
          text-shadow:0 0 5px rgba(255,255,255,.02);
        }
        30%{
          color:rgba(255,255,255,.58);
          text-shadow:0 0 8px rgba(255,255,255,.05);
        }
        76%{
          color:var(--ig-jump-text-soft);
          text-shadow:var(--ig-jump-glow-soft);
        }
        100%{
          color:rgba(255,255,255,.24);
          text-shadow:0 0 0 rgba(255,255,255,0);
        }
      }
      .sv-topic-row-btn.is-search-section-target{
        background: transparent;
      }
      .sv-topic-row-btn.is-search-section-target .sv-topic-title-text{
        animation:igSearchRowTitle var(--ig-jump-duration) cubic-bezier(.22, 1, .36, 1) both;
      }
      .sv-topic-row-btn.is-search-section-target .sv-topic-title-text::before{
        animation:igSearchSpotlight var(--ig-jump-duration) cubic-bezier(.22, 1, .36, 1) both;
      }
      .sv-topic-panel-shell{
        display:block;
        max-height:0;
        opacity: 0;
        visibility: hidden;
        overflow: hidden;
        pointer-events: none;
        transform: translateY(-4px);
        transition:
          max-height var(--ig-panel-motion),
          opacity 180ms ease,
          transform var(--ig-surface-motion),
          visibility 0s linear 320ms;
        will-change: max-height, opacity, transform;
      }
      .sv-topic-panel-shell[data-open="true"]{
        max-height: var(--sv-topic-panel-max-height, 0px);
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateY(0);
        transition:
          max-height var(--ig-panel-motion),
          opacity 180ms ease,
          transform var(--ig-surface-motion),
          visibility 0s;
      }
      @media (prefers-reduced-motion: reduce){
        .sv-topic-row-btn,
        .sv-topic-line,
        .sv-topic-panel-shell{
          transition: none;
        }
      }
      .sv-topic-panel-surface{
        min-height: 0;
        overflow: hidden;
        padding: 0 0 .55rem;
        background: transparent;
      }
      .sv-topic-panel-inner{
        display:flex;
        flex-direction:column;
        gap:.34rem;
        margin-left: 1.1rem;
        padding: .45rem 1rem .7rem 1.15rem;
        border-left: 1px solid rgba(255,255,255,.07);
        border-radius: 0 1rem 1rem 1rem;
        background: rgba(255,255,255,.02);
        transition: background-color var(--ig-surface-motion), border-color var(--ig-surface-motion);
      }
      .sv-topic-line{
        display:flex;
        align-items:flex-start;
        gap:.44rem;
        min-height: 0;
        margin: 0 -.4rem;
        padding: .16rem .4rem;
        background: transparent;
        box-shadow: none;
        transition:
          color var(--ig-surface-motion),
          text-shadow var(--ig-surface-motion),
          opacity var(--ig-surface-motion);
      }
      .sv-topic-line.is-search-target{
        background: transparent;
        box-shadow: none;
      }
      .sv-topic-line.is-search-target .sv-topic-line__code{
        animation:igSearchLineCode var(--ig-jump-duration) cubic-bezier(.22, 1, .36, 1) both;
      }
      .sv-topic-line.is-search-target .sv-topic-line__title{
        animation:igSearchLineTitle var(--ig-jump-duration) cubic-bezier(.22, 1, .36, 1) both;
      }
      .sv-topic-line.is-search-target .sv-topic-line__code::before,
      .sv-topic-line.is-search-target .sv-topic-line__title::before{
        animation:igSearchSpotlight var(--ig-jump-duration) cubic-bezier(.22, 1, .36, 1) both;
      }
      .sv-topic-line__code{
        min-width: 1.95rem;
        flex-shrink: 0;
        color: rgba(255,255,255,.26);
        font-size: .72rem;
        line-height: 1.35;
        font-weight: 500;
        letter-spacing: .01em;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
      .sv-topic-line + .sv-topic-line{
        border-top: 0;
      }
      .sv-topic-line__code{
        color:rgba(255,255,255,.24);
        min-width: 2.35rem;
        font-size:.72rem;
        line-height:1.35;
        font-weight:500;
        letter-spacing:.015em;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        padding-right: .2rem;
      }
      .sv-topic-line__bullet{
        width: .55rem;
        flex-shrink: 0;
        color: rgba(255,255,255,.28);
        font-size: .72rem;
        line-height: 1.35;
        text-align:center;
        margin-top:.02rem;
      }
      .sv-topic-line__title{
        color:rgba(255,255,255,.54);
        font-size:.72rem;
        line-height:1.38;
        font-weight:500;
        letter-spacing:.005em;
      }
      .sv-topic-detail-list{
        display:flex;
        flex-direction:column;
        gap:.34rem;
        width:100%;
        padding:.3rem 0 0 2.58rem;
      }
      .sv-topic-detail-group{
        display:flex;
        flex-direction:column;
        gap:.2rem;
      }
      .sv-topic-detail-group__head{
        display:flex;
        align-items:flex-start;
        gap:.44rem;
      }
      .sv-topic-detail-group__code{
        min-width: 2.35rem;
        flex-shrink: 0;
        color: rgba(255,255,255,.18);
        font-size: .67rem;
        line-height: 1.34;
        font-weight: 600;
        letter-spacing: .02em;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
      .sv-topic-detail-group__title{
        color: rgba(255,255,255,.42);
        font-size: .67rem;
        line-height: 1.34;
        font-weight: 600;
        letter-spacing: .01em;
      }
      .sv-topic-detail-group__items{
        display:flex;
        flex-direction:column;
        gap:.18rem;
        padding-left: 2.78rem;
      }
      .sv-topic-detail-bullet{
        display:flex;
        align-items:flex-start;
        gap:.42rem;
      }
      .sv-topic-detail-bullet__dot{
        width:.55rem;
        flex-shrink:0;
        color: rgba(255,255,255,.18);
        font-size:.68rem;
        line-height:1.35;
        text-align:center;
      }
      .sv-topic-detail-bullet__title{
        color: rgba(255,255,255,.34);
        font-size: .67rem;
        line-height: 1.34;
        font-weight: 500;
        letter-spacing: .004em;
      }
      .subject-section-shell[data-theme="light"]{
        --ig-jump-text:#000000;
        --ig-jump-text-soft:#666666;
        --ig-jump-glow:0 0 14px rgba(0,0,0,.08);
        --ig-jump-glow-soft:0 0 12px rgba(0,0,0,.05);
        background:#F1EFE7;
        color:#000000;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__header{
        border-bottom-color:#E9E3D8;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__crumb,
      .subject-section-shell[data-theme="light"] .subject-section-shell__subtitle,
      .subject-section-shell[data-theme="light"] [data-role="level-note"],
      .subject-section-shell[data-theme="light"] [data-role="level-label"],
      .subject-section-shell[data-theme="light"] [data-role="level-count"],
      .subject-section-shell[data-theme="light"] .sv-topic-title-text,
      .subject-section-shell[data-theme="light"] .sv-topic-count-text,
      .subject-section-shell[data-theme="light"] .sv-topic-chevron,
      .subject-section-shell[data-theme="light"] .sv-topic-line__code,
      .subject-section-shell[data-theme="light"] .sv-topic-line__bullet,
      .subject-section-shell[data-theme="light"] .sv-topic-line__title,
      .subject-section-shell[data-theme="light"] .sv-topic-detail-group__code,
      .subject-section-shell[data-theme="light"] .sv-topic-detail-group__title,
      .subject-section-shell[data-theme="light"] .sv-topic-detail-bullet__dot,
      .subject-section-shell[data-theme="light"] .sv-topic-detail-bullet__title{
        color:#666666;
      }
      .subject-section-shell[data-theme="light"] .subject-section-shell__crumb-current,
      .subject-section-shell[data-theme="light"] .subject-section-shell__title{
        color:#000000;
      }
      .subject-section-shell[data-theme="light"] [data-role="level-summary"] .flex-1{
        background:#E9E3D8;
      }
      .subject-section-shell[data-theme="light"] .sv-topic-row-btn[data-open="true"]{
        background:rgba(0,0,0,.03);
      }
      .subject-section-shell[data-theme="light"] .sv-topic-index-text{
        color:#000000;
        opacity:1;
      }
      .subject-section-shell[data-theme="light"] .sv-topic-dot-marker{
        background:#000000;
        opacity:1;
      }
      .subject-section-shell[data-theme="light"] .sv-topic-row-btn[data-open="true"] .sv-topic-title-text{
        color:#000000;
      }
      .subject-section-shell[data-theme="light"] .sv-topic-row-btn[data-open="true"] .sv-topic-count-text,
      .subject-section-shell[data-theme="light"] .sv-topic-row-btn[data-open="false"]:hover .sv-topic-chevron{
        color:#666666;
      }
      .subject-section-shell[data-theme="light"] .sv-topic-indicator{
        background:#000000;
      }
      .subject-section-shell[data-theme="light"] .sv-topic-title-text::before,
      .subject-section-shell[data-theme="light"] .sv-topic-line__code::before,
      .subject-section-shell[data-theme="light"] .sv-topic-line__title::before{
        background:radial-gradient(ellipse at center, rgba(0,0,0,.1) 0%, rgba(0,0,0,.04) 42%, transparent 74%);
      }
      .subject-section-shell[data-theme="light"] .sv-topic-row-btn.is-search-section-target .sv-topic-title-text{
        animation-name:igSearchRowTitleLight;
      }
      .subject-section-shell[data-theme="light"] .sv-topic-line.is-search-target .sv-topic-line__code{
        animation-name:igSearchLineCodeLight;
      }
      .subject-section-shell[data-theme="light"] .sv-topic-line.is-search-target .sv-topic-line__title{
        animation-name:igSearchLineTitleLight;
      }
      .subject-section-shell[data-theme="light"] .sv-topic-panel-inner{
        border-left-color:#E9E3D8;
        background:#FFFFFF;
      }
      @media (max-width: 640px){
        .sv-topic-panel-surface{
          padding: 0 0 .5rem;
        }
        .sv-topic-panel-inner{
          margin-left: .85rem;
          padding: .4rem .78rem .56rem .95rem;
        }
        .sv-topic-line{
          gap: .42rem;
        }
        .sv-topic-line__code{
          min-width: 1.75rem;
          font-size: .68rem;
        }
        .sv-topic-line__title{
          font-size: .68rem;
        }
        .sv-topic-detail-list{
          padding-left: 2.2rem;
        }
        .sv-topic-detail-group__code{
          min-width: 2rem;
          font-size: .64rem;
        }
        .sv-topic-detail-group__items{
          padding-left: 2.38rem;
        }
        .sv-topic-detail-group__title,
        .sv-topic-detail-bullet__title{
          font-size: .64rem;
        }
      }
    </style>
    <div class="subject-section-shell" data-theme="${escapeHtml(host.dataset.theme || 'dark')}">
      <div class="subject-section-shell__header">
        <div class="subject-section-shell__inner">
          <div class="subject-section-shell__crumb">
            <span>${escapeHtml(subjectMeta.name)}</span>
            <span>/</span>
            <span class="subject-section-shell__crumb-current">Syllabus</span>
          </div>
          <div class="subject-section-shell__head">
            <div class="subject-section-shell__meta">
              <h1 class="subject-section-shell__title">${escapeHtml(subjectMeta.name)}</h1>
              <p class="subject-section-shell__subtitle">Cambridge IGCSE · ${escapeHtml(subjectMeta.code || '')}</p>
            </div>
            <div class="subject-section-shell__tabs">
              <button data-top-tab="syllabus" class="subject-section-shell__tab is-active">Syllabus</button>
              <button data-top-tab="past-papers" class="subject-section-shell__tab">Past Papers</button>
            </div>
          </div>
        </div>
      </div>
      <div class="subject-section-shell__inner subject-section-shell__body">
        <div data-role="section-row" class="subject-section-shell__section-row">
          <div data-role="level-switch" class="flex bg-white/[0.05] rounded-full p-1 gap-1">
            <button data-level="core" class="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200">Core</button>
            <button data-level="extended" class="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200">Extended</button>
          </div>
          <p data-role="level-note" class="text-xs text-white/25">Suitable for all students</p>
        </div>
        <div class="subject-section-shell__content">
          <div>
            <div data-role="level-summary" class="flex items-center gap-3 mb-5">
              <span data-role="level-label" class="text-xs font-semibold uppercase tracking-widest text-white/30">Core</span>
              <div class="flex-1 h-px bg-white/[0.05]"></div>
              <span data-role="level-count" class="text-xs text-white/20">0 topics</span>
            </div>
            <div data-role="topic-list" class="space-y-1"></div>
          </div>
        </div>
      </div>

    </div>
  `;

  shell = shadow.querySelector('.subject-section-shell');
  syncHostTheme();
  topSyllabusButton = shadow.querySelector('[data-top-tab="syllabus"]');
  topPastPapersButton = shadow.querySelector('[data-top-tab="past-papers"]');
  const sectionRow = shadow.querySelector('[data-role="section-row"]');
  const levelSwitch = shadow.querySelector('[data-role="level-switch"]');
  const levelNote = shadow.querySelector('[data-role="level-note"]');
  const levelSummary = shadow.querySelector('[data-role="level-summary"]');
  const levelLabel = shadow.querySelector('[data-role="level-label"]');
  const levelCount = shadow.querySelector('[data-role="level-count"]');
  const topicList = shadow.querySelector('[data-role="topic-list"]');
  const contentRoot = shadow.querySelector('.subject-section-shell__content');
  const levelButtons = shadow.querySelectorAll('[data-level]');
  const levelNoteText = {
    core: 'Suitable for all students',
    extended: 'Includes additional topics beyond Core'
  };
  let highlightTimer = 0;
  let activeFocusTargets = new Map();

  if(!levels.hasDistinctLevels){
    if(sectionRow) sectionRow.style.display = 'none';
    if(levelSwitch) levelSwitch.style.display = 'none';
    if(levelNote) levelNote.style.display = 'none';
    if(levelSummary) levelSummary.style.display = 'none';
    if(levelLabel) levelLabel.style.display = 'none';
    if(contentRoot) contentRoot.style.marginTop = '0';
  }

  if(levels.hasDistinctLevels){
    dataStore.setSubjectLevel(subjectRef, state.activeLevel);
  }

  function applyShellTabVisualState(){
    const isLight = resolveShellTheme() === 'light';
    const tabsWrap = topSyllabusButton && topSyllabusButton.parentElement;
    const tabs = [topSyllabusButton, topPastPapersButton].filter(Boolean);
    if(tabsWrap){
      tabsWrap.style.background = isLight ? '#FFFFFF' : 'rgba(255,255,255,.05)';
      tabsWrap.style.boxShadow = isLight ? '0 0 0 1px #E9E3D8 inset' : '';
    }
    tabs.forEach((button) => {
      const isActive = button.classList.contains('is-active');
      if(isLight){
        button.style.background = isActive ? '#000000' : 'transparent';
        button.style.color = isActive ? '#FFFFFF' : '#666666';
        button.style.boxShadow = 'none';
      }else{
        button.style.background = isActive ? '#FFFFFF' : 'transparent';
        button.style.color = isActive ? '#000000' : 'rgba(255,255,255,.5)';
        button.style.boxShadow = isActive ? '0 1px 3px rgba(0,0,0,.1)' : 'none';
      }
    });
  }

  function setShellTab(nextTab){
    if(topSyllabusButton){
      topSyllabusButton.classList.toggle('is-active', nextTab !== 'past-papers');
    }
    if(topPastPapersButton){
      topPastPapersButton.classList.toggle('is-active', nextTab === 'past-papers');
    }
    applyShellTabVisualState();
  }

  function syncShellTabWithActivePanel(){
    if(!(zipContext && zipContext.tabsRoot)) return;
    setShellTab(getActiveSubjectTabId(zipContext.tabsRoot) === 'tab-pp' ? 'past-papers' : 'syllabus');
  }

  if(zipContext && zipContext.tabsRoot){
    if(root.__igcsefySubjectTabSyncHandler){
      zipContext.tabsRoot.removeEventListener('igcsefy:subject-tab-change', root.__igcsefySubjectTabSyncHandler);
    }
    root.__igcsefySubjectTabSyncHandler = syncShellTabWithActivePanel;
    zipContext.tabsRoot.addEventListener('igcsefy:subject-tab-change', syncShellTabWithActivePanel);
    syncShellTabWithActivePanel();
  }

  function flashFocusTargets(targets){
    const specs = Array.isArray(targets)
      ? targets
          .map((target) => {
            if(!target) return null;
            if(target instanceof Element){
              return { node: target, className: 'is-search-target' };
            }
            if(target.node instanceof Element){
              return {
                node: target.node,
                className: String(target.className || 'is-search-target').trim() || 'is-search-target'
              };
            }
            return null;
          })
          .filter(Boolean)
      : [];
    const nextTargets = new Map(specs.map(({ node, className }) => [node, className]));

    activeFocusTargets.forEach((className, node) => {
      if(nextTargets.get(node) !== className){
        node.classList.remove(className);
      }
    });
    nextTargets.forEach((className, node) => {
      const wasActive = activeFocusTargets.get(node) === className;
      if(wasActive){
        node.classList.remove(className);
        void node.offsetWidth;
      }
      node.classList.add(className);
    });
    activeFocusTargets = nextTargets;
    if(!activeFocusTargets.size){
      if(highlightTimer){
        clearTimeout(highlightTimer);
        highlightTimer = 0;
      }
      return;
    }

    if(highlightTimer){
      clearTimeout(highlightTimer);
    }

    highlightTimer = window.setTimeout(() => {
      activeFocusTargets.forEach((className, node) => node.classList.remove(className));
      activeFocusTargets.clear();
    }, 2860);
  }

  if(topSyllabusButton && zipContext && zipContext.tabsRoot){
    topSyllabusButton.addEventListener('click', () => {
      setShellTab('syllabus');
      setActiveSubjectTab(zipContext.tabsRoot, 'tab-syl');
      requestAnimationFrame(zipContext.syncNativeTabsVisibility);
    });
  }

  if(topPastPapersButton && zipContext && zipContext.tabsRoot){
    topPastPapersButton.addEventListener('click', () => {
      setShellTab('past-papers');
      setActiveSubjectTab(zipContext.tabsRoot, 'tab-pp');
      requestAnimationFrame(zipContext.syncNativeTabsVisibility);
    });
  }

  function setPanelState(panel, isOpen, immediate){
    if(!panel) return;
    const panelSurface = panel.firstElementChild;
    if(panelSurface && panelSurface.scrollHeight){
      panel.style.setProperty('--sv-topic-panel-max-height', `${panelSurface.scrollHeight}px`);
    }
    if(immediate){
      const previousTransition = panel.style.transition;
      panel.style.transition = 'none';
      panel.dataset.open = isOpen ? 'true' : 'false';
      panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      requestAnimationFrame(() => {
        panel.style.transition = previousTransition;
      });
      return;
    }
    panel.dataset.open = isOpen ? 'true' : 'false';
    panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }

  function setTopicOpenState(item, isOpen, immediate){
    if(!item) return;
    item.rowButton.dataset.open = isOpen ? 'true' : 'false';
    item.rowButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    item.chevron.style.transform = isOpen ? 'rotate(90deg)' : '';
    item.chevron.classList.toggle('text-white/45', isOpen);
    item.chevron.classList.toggle('text-white/20', !isOpen);
    setPanelState(item.panel, isOpen, immediate);
  }

  function syncLevelPanelHeights(level){
    const view = levelViews[level];
    if(!view) return;
    view.items.forEach((item) => {
      const panelSurface = item.panel.firstElementChild;
      if(panelSurface && panelSurface.scrollHeight){
        item.panel.style.setProperty('--sv-topic-panel-max-height', `${panelSurface.scrollHeight}px`);
      }
    });
  }

  function applyOpenTopics(level, immediate){
    const view = levelViews[level];
    if(!view) return;
    const openTopicIds = state.openTopicIds[level];
    view.items.forEach((item, topicId) => {
      setTopicOpenState(item, openTopicIds.has(topicId), immediate);
    });
  }

  function toggleTopic(level, topicId){
    const openTopicIds = state.openTopicIds[level];
    if(openTopicIds.has(topicId)){
      openTopicIds.delete(topicId);
    }else{
      openTopicIds.add(topicId);
    }
    applyOpenTopics(level, false);
  }

  function ensureLevelView(level){
    if(levelViews[level]) return levelViews[level];

    const topics = topicsByLevel[level] || [];
    const levelRoot = document.createElement('div');
    levelRoot.className = 'space-y-1';
    const items = new Map();

    topics.forEach((topic, index) => {
      const topicWrap = document.createElement('div');
      topicWrap.className = 'rounded-xl';

      const rowButton = document.createElement('button');
      rowButton.type = 'button';
      rowButton.className = 'sv-topic-row-btn w-full group flex items-center gap-4 px-4 py-3.5 cursor-pointer text-left relative';
      rowButton.dataset.open = 'false';

      const panelId = `sv-topic-panel-${level}-${index + 1}`;
      rowButton.setAttribute('aria-expanded', 'false');
      rowButton.setAttribute('aria-controls', panelId);

      const indicator = document.createElement('div');
      indicator.className = 'sv-topic-indicator absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-white transition-all duration-200';

      const indexEl = document.createElement('span');
      indexEl.className = 'sv-topic-index-text text-xs font-mono w-5 shrink-0 text-white/25 group-hover:text-white/40 transition-colors';
      indexEl.textContent = String(index + 1).padStart(2, '0');

      const dotEl = document.createElement('span');
      dotEl.className = 'sv-topic-dot-marker w-1.5 h-1.5 rounded-full shrink-0 bg-white opacity-20 group-hover:opacity-50 transition-opacity';

      const titleEl = document.createElement('span');
      titleEl.className = 'sv-topic-title-text flex-1 text-sm font-medium text-white/70 group-hover:text-white transition-colors';
      titleEl.textContent = stripSyllabusSectionPrefix(topic.name, topic.name);

      const subtopicCountEl = document.createElement('span');
      subtopicCountEl.className = 'sv-topic-count-text text-xs text-white/20 group-hover:text-white/40 transition-colors shrink-0 hidden sm:block';
      subtopicCountEl.textContent = `${topic.topicCount} ${topic.topicCount === 1 ? 'topic' : 'topics'}`;

      const chevron = renderChevronIcon(
        'right',
        'sv-topic-chevron w-3.5 h-3.5 shrink-0 text-white/20 transition-all duration-200'
      );

      rowButton.appendChild(indicator);
      rowButton.appendChild(indexEl);
      rowButton.appendChild(dotEl);
      rowButton.appendChild(titleEl);
      rowButton.appendChild(subtopicCountEl);
      rowButton.appendChild(chevron);

      const panel = document.createElement('div');
      panel.id = panelId;
      panel.className = 'sv-topic-panel-shell';
      panel.dataset.open = 'false';
      panel.setAttribute('aria-hidden', 'true');

      const panelSurface = document.createElement('div');
      panelSurface.className = 'sv-topic-panel-surface';
      const panelInner = document.createElement('div');
      panelInner.className = 'sv-topic-panel-inner';
      const lineByTopicId = new Map();

      topic.topics.forEach((leafTopic) => {
        const code = String(leafTopic && leafTopic.code ? leafTopic.code : '').trim();
        const titleText = String(leafTopic && leafTopic.title ? leafTopic.title : 'Topic').trim() || 'Topic';
        const details = buildSyllabusTopicDetails(leafTopic);

        const line = document.createElement('div');
        line.className = 'sv-topic-line';
        if(leafTopic && leafTopic.id){
          line.dataset.topicId = String(leafTopic.id);
          lineByTopicId.set(String(leafTopic.id), line);
        }

        const lead = document.createElement('span');
        if(code){
          lead.className = 'sv-topic-line__code';
          lead.textContent = code;
        }else{
          lead.className = 'sv-topic-line__bullet';
          lead.setAttribute('aria-hidden', 'true');
          lead.textContent = '•';
        }

        const title = document.createElement('span');
        title.className = 'sv-topic-line__title';
        title.textContent = titleText;

        line.appendChild(lead);
        line.appendChild(title);
        panelInner.appendChild(line);

        if(details.length){
          const detailList = document.createElement('div');
          detailList.className = 'sv-topic-detail-list';

          details.forEach((detail) => {
            if(detail && detail.kind === 'group'){
              const group = document.createElement('div');
              group.className = 'sv-topic-detail-group';

              const head = document.createElement('div');
              head.className = 'sv-topic-detail-group__head';

              const groupCode = document.createElement('span');
              groupCode.className = 'sv-topic-detail-group__code';
              groupCode.textContent = String(detail.code || '').trim() || ' ';

              const groupTitle = document.createElement('span');
              groupTitle.className = 'sv-topic-detail-group__title';
              groupTitle.textContent = String(detail.title || '').trim() || 'Detail';

              head.appendChild(groupCode);
              head.appendChild(groupTitle);
              group.appendChild(head);

              if(Array.isArray(detail.items) && detail.items.length){
                const itemList = document.createElement('div');
                itemList.className = 'sv-topic-detail-group__items';

                detail.items.forEach((detailItem) => {
                  const bullet = document.createElement('div');
                  bullet.className = 'sv-topic-detail-bullet';

                  const dot = document.createElement('span');
                  dot.className = 'sv-topic-detail-bullet__dot';
                  dot.setAttribute('aria-hidden', 'true');
                  dot.textContent = '•';

                  const bulletTitle = document.createElement('span');
                  bulletTitle.className = 'sv-topic-detail-bullet__title';
                  bulletTitle.textContent = String(detailItem && detailItem.title ? detailItem.title : '').trim();

                  bullet.appendChild(dot);
                  bullet.appendChild(bulletTitle);
                  itemList.appendChild(bullet);
                });

                group.appendChild(itemList);
              }

              detailList.appendChild(group);
              return;
            }

            const bullet = document.createElement('div');
            bullet.className = 'sv-topic-detail-bullet';

            const dot = document.createElement('span');
            dot.className = 'sv-topic-detail-bullet__dot';
            dot.setAttribute('aria-hidden', 'true');
            dot.textContent = '•';

            const bulletTitle = document.createElement('span');
            bulletTitle.className = 'sv-topic-detail-bullet__title';
            bulletTitle.textContent = String(detail && detail.title ? detail.title : '').trim();

            bullet.appendChild(dot);
            bullet.appendChild(bulletTitle);
            detailList.appendChild(bullet);
          });

          panelInner.appendChild(detailList);
        }
      });

      panelSurface.appendChild(panelInner);
      panel.appendChild(panelSurface);

      rowButton.addEventListener('click', () => {
        toggleTopic(level, topic.id);
      });

      topicWrap.appendChild(rowButton);
      topicWrap.appendChild(panel);
      levelRoot.appendChild(topicWrap);
      items.set(topic.id, {
        id: topic.id,
        sectionId: topic.sectionId || topic.id,
        wrap: topicWrap,
        rowButton,
        chevron,
        panel,
        lineByTopicId
      });
    });

    levelViews[level] = { root: levelRoot, items };
    return levelViews[level];
  }

  function findItemBySectionId(level, sectionId){
    if(!sectionId) return null;
    const view = ensureLevelView(level);
    if(!view) return null;

    for(const item of view.items.values()){
      if(item.sectionId === sectionId){
        return item;
      }
    }

    return null;
  }

  function applyLocationIntent(immediate){
    if(initialSubjectDestination === 'past-papers' && zipContext && zipContext.tabsRoot){
      setShellTab('past-papers');
      setActiveSubjectTab(zipContext.tabsRoot, getSubjectPanelIdForDestination(initialSubjectDestination));
      requestAnimationFrame(zipContext.syncNativeTabsVisibility);
      return;
    }

    setShellTab('syllabus');

    if(!(locationIntent.sectionId || locationIntent.topicId)){
      return;
    }

    const targetLevel = levels.hasDistinctLevels && locationIntent.level === 'extended' ? 'extended' : 'core';
    const item = findItemBySectionId(targetLevel, locationIntent.sectionId);
    if(!item){
      return;
    }

    state.openTopicIds[targetLevel].add(item.id);
    applyOpenTopics(targetLevel, immediate);

    const lineTarget = locationIntent.topicId ? item.lineByTopicId.get(locationIntent.topicId) : null;
    const focusTarget = lineTarget || item.rowButton;
    const delay = immediate ? 0 : 220;

    window.setTimeout(() => {
      requestAnimationFrame(() => {
        if(focusTarget && typeof focusTarget.scrollIntoView === 'function'){
          focusTarget.scrollIntoView({
            behavior: immediate ? 'auto' : 'smooth',
            block: 'center'
          });
        }
        flashFocusTargets(
          lineTarget
            ? [{ node: lineTarget, className: 'is-search-target' }]
            : [{ node: item.rowButton, className: 'is-search-section-target' }]
        );
      });
    }, delay);
  }

  const setLevelButtonState = () => {
    levelButtons.forEach(button => {
      const level = button.getAttribute('data-level');
      const active = level === state.activeLevel;
      button.dataset.active = active ? 'true' : 'false';
      button.className = 'px-5 py-2 rounded-full text-sm font-medium transition-all duration-200';
    });
  };

  const renderTopics = () => {
    const level = state.activeLevel;
    const topics = topicsByLevel[level] || [];
    const totalTopicCount = topics.reduce((sum, section) => sum + (section.topicCount || 0), 0);
    const levelView = ensureLevelView(level);

    if(levels.hasDistinctLevels){
      if(levelLabel) levelLabel.textContent = level === 'core' ? 'Core' : 'Extended';
      if(levelNote) levelNote.textContent = levelNoteText[level];
      setLevelButtonState();
    }
    if(levelCount) levelCount.textContent = `${totalTopicCount} ${totalTopicCount === 1 ? 'topic' : 'topics'}`;
    topicList.innerHTML = '';
    topicList.appendChild(levelView.root);
    syncLevelPanelHeights(level);
    applyOpenTopics(level, true);
  };

  levelButtons.forEach(button => {
    button.addEventListener('click', () => {
      const nextLevel = button.getAttribute('data-level');
      if(!levels.hasDistinctLevels || !nextLevel || nextLevel === state.activeLevel) return;
      dataStore.setSubjectLevel(subjectRef, nextLevel);
      state.activeLevel = nextLevel;
      renderTopics();
    });
  });

  window.addEventListener('igcsefy:data-change', event => {
    const detail = event && event.detail ? event.detail : null;
    if(!detail || detail.reason !== 'subject-level') return;
    const nextLevel = dataStore.getSubjectLevel(subjectRef, state.activeLevel);
    if(nextLevel === state.activeLevel || !levels.hasDistinctLevels) return;
    state.activeLevel = nextLevel;
    renderTopics();
  });

  if(root.__igcsefySyllabusResizeHandler){
    window.removeEventListener('resize', root.__igcsefySyllabusResizeHandler);
  }
  root.__igcsefySyllabusResizeHandler = () => {
    window.requestAnimationFrame(() => {
      syncLevelPanelHeights(state.activeLevel);
    });
  };
  window.addEventListener('resize', root.__igcsefySyllabusResizeHandler, { passive: true });

  renderTopics();
  applyLocationIntent(true);
}

async function loadSyllabus(containerId, jsonPath){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(el.__igcsefySyllabusRendered || el.__igcsefySyllabusLoading) return;
  const initialMeta = extractSubjectMeta({}, containerId, jsonPath, el);
  const locationIntent = readSubjectNavigationIntent();
  const initialSubjectDestination = resolveInitialSubjectDestination(locationIntent, initialMeta.slug);
  const panel = el.closest('[role="tabpanel"]');
  const shouldDefer = !!(
    panel &&
    panel.getAttribute('aria-hidden') === 'true' &&
    initialSubjectDestination === 'past-papers'
  );
  if(shouldDefer){
    if(el.__igcsefySyllabusDeferred) return;
    el.__igcsefySyllabusDeferred = true;
    waitForTabPanelVisible(el, () => {
      el.__igcsefySyllabusDeferred = false;
      loadSyllabus(containerId, jsonPath);
    });
    return;
  }
  el.__igcsefySyllabusLoading = true;
  const zipContext = setupSubjectSyllabusZipContext(el);
  el.innerHTML = '';
  const bootShell = scheduleSyllabusBootShell(el, initialMeta, { delay: 900, minVisible: 180 });
  try{
    const cssPromise = loadSyllabusZipCss().catch(() => '');
    const res = await fetch(jsonPath, {cache:'no-store'});
    if(!res.ok) throw new Error('Not found');
    const data = await res.json();
    const resolvedMeta = extractSubjectMeta(data, containerId, jsonPath, el);
    const cssText = await cssPromise;
    await bootShell.settle();
    bootShell.cancel();
    await renderSyllabus(el, data, resolvedMeta, zipContext, cssText);
    el.__igcsefySyllabusRendered = true;
    if(zipContext) zipContext.syncNativeTabsVisibility();
  }catch(e){
    await bootShell.settle();
    bootShell.cancel();
    el.innerHTML = '<p style="color:' + (isLightThemeActive() ? '#666666' : '#BEBEBE') + ';text-align:center">Syllabus will appear here.</p>';
  }finally{
    el.__igcsefySyllabusLoading = false;
  }
}

/* Accounting past papers (unchanged) */
const ACCOUNTING = {subject:'Accounting (0452)', code:'0452', series:[{year:2024,session:'s',label:'May/June 2024 (s24)',papers:['11','12','13','21','22','23']},{year:2024,session:'w',label:'Oct/Nov 2024 (w24)',papers:['11','12','13','21','22','23']}], types:['qp','ms']};
function buildAccountingCards(){
  const grid=document.getElementById('grid'); if(!grid) return;
  const q=(document.getElementById('q')?.value||'').toLowerCase().trim();
  const sess=document.getElementById('session').value;
  const type=document.getElementById('type').value;
  const paperSel=document.getElementById('paper').value;
  grid.innerHTML='';
  const items=[];
  for(const s of ACCOUNTING.series){
    if(sess && (s.session+s.year)!==sess) continue;
    for(const t of ACCOUNTING.types){
      if(type && t!==type) continue;
      for(const p of s.papers){
        if(paperSel && p!==paperSel) continue;
        const title=`${ACCOUNTING.subject} — ${t.toUpperCase()} ${p}`;
        const href=`/resources/accounting-0452/${s.year}/${s.session}/${ACCOUNTING.code}_${s.session}${String(s.year).slice(-2)}_${t}_${p}.pdf`;
        const hay=(title+' '+s.label+' '+href).toLowerCase();
        if(q && !hay.includes(q)) continue;
        items.push({title,meta:s.label,href});
      }
    }
  }
  for(const it of items){
    const el=document.createElement('article'); el.className='card';
    el.innerHTML=`<div class="content"><h3>${it.title}</h3><div class="meta">${it.meta}</div></div><div class="actions"><a class="pill" href="${it.href}" download>Download</a></div>`;
    grid.appendChild(el);
  }
  const c=document.getElementById('count'); if(c) c.textContent = items.length+' results';
}
function initAccountingFilters(){
  const sessSel=document.getElementById('session'); if(!sessSel) return;
  [{year:2024,session:'s',label:'May/June 2024 (s24)'},{year:2024,session:'w',label:'Oct/Nov 2024 (w24)'}].forEach(s=>{const o=document.createElement('option');o.value=s.session+s.year;o.textContent=s.label;sessSel.appendChild(o)});
  const typeSel=document.getElementById('type'); [['','All types'],['qp','Question Papers'],['ms','Mark Schemes']].forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;typeSel.appendChild(o)});
  const paperSel=document.getElementById('paper'); ['','11','12','13','21','22','23'].forEach(p=>{const o=document.createElement('option');o.value=p;o.textContent=p?('Paper '+p):'All papers';paperSel.appendChild(o)});
  ['session','type','paper','q'].forEach(id=>{const el=document.getElementById(id); el&&el.addEventListener('input',buildAccountingCards); el&&el.addEventListener('change',buildAccountingCards); });
  buildAccountingCards();
}
document.addEventListener('DOMContentLoaded',()=>{ initTabs(); initAccountingFilters(); });
document.addEventListener('DOMContentLoaded',()=>{ initGlobalMotion(); });
loadSyllabusZipCss().catch(() => {});
window.igcsefy = { loadSyllabus };
