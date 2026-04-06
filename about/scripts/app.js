
function onScrollHeader(){const h=document.querySelector('header');if(!h)return; if(scrollY>8)h.classList.add('scrolled'); else h.classList.remove('scrolled');}
document.addEventListener('scroll',onScrollHeader,{passive:true});document.addEventListener('DOMContentLoaded',onScrollHeader);

/* Lightweight global scroll/hover polish (kept tiny for low-end devices) */
function initGlobalMotion(){
  document.documentElement.classList.add('js');

  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = (navigator.connection && navigator.connection.saveData) ? true : false;
  if(prefersReduced || saveData) return;

  /* Header reveal/hide (no layout shift, only transform) */
  const header = document.querySelector('header');
  if(header){
    let lastY = window.scrollY || 0;
    let ticking = false;
    const threshold = 10;
    const minY = 140;
    const onScroll = ()=>{
      if(ticking) return;
      ticking = true;
      requestAnimationFrame(()=>{
        const y = window.scrollY || 0;
        const goingDown = (y - lastY) > threshold;
        const goingUp = (lastY - y) > threshold;
        if(goingDown && y > minY){
          header.classList.add('is-hidden');
        }else if(goingUp || y < minY){
          header.classList.remove('is-hidden');
        }
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, {passive:true});
  }

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
        root.querySelectorAll('[role="tab"]').forEach(t=>t.setAttribute('aria-selected','false'));
        root.querySelectorAll('[role="tabpanel"]').forEach(p=>p.setAttribute('aria-hidden','true'));
        tab.setAttribute('aria-selected','true');
        const panel = root.querySelector('#'+tab.getAttribute('aria-controls'));
        if(panel) panel.setAttribute('aria-hidden','false');
      });
    });
  });
}

/* Accordion builder */
function renderAccordionList(units){
  const acc = document.createElement('div'); acc.className='accordion';
  (units||[]).forEach((u,i)=>{
    const it = document.createElement('div'); it.className='ac-item';
    const btn = document.createElement('button'); btn.className='ac-h'; btn.setAttribute('aria-expanded','false');
    const title = u.title ? u.title : ('Unit '+(i+1));
    btn.innerHTML = `<span>${title}</span><span class="chev">›</span>`;
    const body = document.createElement('div'); body.className='ac-b';
    const inner = document.createElement('div'); inner.className='ac-inner';
    const topics = Array.isArray(u.topics) ? u.topics : [];
    if(topics.length){
      const ul = document.createElement('ul'); ul.className='ac-list';
      topics.forEach(t=>{ const li=document.createElement('li'); li.textContent=t; ul.appendChild(li); });
      inner.appendChild(ul);
    }
    body.appendChild(inner);
    btn.addEventListener('click',()=>{
      const open = btn.getAttribute('aria-expanded')==='true';
      btn.setAttribute('aria-expanded', String(!open));
      body.style.maxHeight = open ? '0px' : (inner.scrollHeight+24)+'px';
    });
    it.appendChild(btn); it.appendChild(body); acc.appendChild(it);
  });
  return acc;
}

/* Render syllabus (supports either {units:[]} OR {core:[],extended:[]} ) */
function renderSyllabus(root, data){
  root.innerHTML='';
  if((data.core && data.core.length) || (data.extended && data.extended.length)){
    const grid = document.createElement('div'); grid.className='syll-grid cols-2';
    const left = document.createElement('div'); left.className='syll-col';
    const right = document.createElement('div'); right.className='syll-col';
    if(data.core){ const h=document.createElement('h3'); h.textContent='Core'; left.appendChild(h); left.appendChild(renderAccordionList(data.core)); }
    if(data.extended){ const h=document.createElement('h3'); h.textContent='Extended'; right.appendChild(h); right.appendChild(renderAccordionList(data.extended)); }
    grid.appendChild(left); grid.appendChild(right); root.appendChild(grid);
  }else{
    root.appendChild(renderAccordionList((data && data.units)||[]));
  }
}

async function loadSyllabus(containerId, jsonPath){
  const el = document.getElementById(containerId);
  if(!el) return;
  try{
    const res = await fetch(jsonPath, {cache:'no-store'});
    if(!res.ok) throw new Error('Not found');
    const data = await res.json();
    renderSyllabus(el, data);
  }catch(e){
    el.innerHTML = '<p style="color:#BEBEBE;text-align:center">Syllabus will appear here.</p>';
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
window.igcsefy = { loadSyllabus };
