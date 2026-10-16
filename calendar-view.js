import { CATEGORY, TYPES, categoriesFor, typeFor, dayKeys, visible } from './calendar-model.js';
(() => {
  const grid = document.querySelector('[data-calendar-grid]');
  if (!grid) return;

  const title = document.querySelector('[data-calendar-month-title]');
  const filters = document.querySelector('[data-calendar-filters]');
  const typeFilters = document.querySelector('[data-calendar-types]');
  const status = document.querySelector('[data-calendar-status]');
  const mobile = document.querySelector('[data-calendar-mobile]');
  const dialog = document.querySelector('[data-event-dialog]');
  const dialogContent = document.querySelector('[data-event-dialog-content]');
  const closeDialog = document.querySelector('[data-event-dialog-close]');
  const prev = document.querySelector('[data-calendar-prev]');
  const next = document.querySelector('[data-calendar-next]');
  const todayButton = document.querySelector('[data-calendar-today]');

  const state = { month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), events: [], manual: [], imported: [], active: 'all', type: 'all' };
  const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
  const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' });
  const timeFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

  const clean = value => String(value ?? '').trim();
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
  const slug = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const parseDate = value => {
    if (!value) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const categoryFrom = raw => {
    const value = slug(raw);
    if (value.includes('cadette') || value.includes('feminin')) return 'cadettes';
    if (value.includes('u16') || value.includes('u18') || value.includes('u19') || value.includes('jeune') || value.includes('junior') || value.includes('cadet')) return 'jeunes';
    if (value.includes('ecole') || value.includes('u6') || value.includes('u8') || value.includes('u10') || value.includes('u12') || value.includes('u14') || value.includes('m8')) return 'ecole';
    return 'seniors';
  };
  const normalize = (raw, index) => {
    const date = parseDate(raw.date || raw.start || raw.startDate || raw.datetime || raw.jour);
    if (!date) return null;
    const categories = categoriesFor(raw);
    const category = categories[0];
    const kind = typeFor(raw);
    const type = kind === 'unknown' ? '' : TYPES[kind];
    const days = raw.source === 'sporteasy' ? dayKeys(raw.start, raw.end, raw.allDay) : { first: localDay(date), last: localDay(date) };
    const home = clean(raw.home || raw.equipeDomicile || raw.host || raw.local);
    const away = clean(raw.away || raw.equipeExterieure || raw.guest || raw.visiteur || raw.opponent || raw.adversaire);
    const fallbackTitle = home && away ? `${home} – ${away}` : (away ? `RCC – ${away}` : type);
    return {
      id: raw.id || `event-${index}`,
      date,
      category,
      categories, kind, days,
      type,
      title: clean(raw.title || raw.titre || raw.name || raw.nom || fallbackTitle),
      time: raw.source === 'sporteasy' ? (raw.allDay ? '' : timeFormatter.format(date)) : clean(raw.time || raw.heure || raw.startTime),
      location: clean(raw.location || raw.lieu || raw.venue || raw.stade),
      competition: clean(raw.competition || raw.championnat || raw.tournoi),
      home, away,
      description: clean(raw.description || raw.details || raw.info || raw.notes),
      raw
    };
  };
  const extractArray = payload => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of ['events','matches','matchs','calendar','calendrier','items','data']) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
  };
  async function loadEvents() {
    const candidates = ['./data/matches.json','./data/matchs.json','./data/calendar.json','./data/calendrier.json','./data/events.json'];
    for (const url of candidates) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) continue;
        const rows = extractArray(await response.json());
        if (rows.length) return rows.map(normalize).filter(Boolean);
      } catch (_) {}
    }
    return [];
  }
  let requestNumber = 0;
  const monthKey = () => `${state.month.getFullYear()}-${String(state.month.getMonth() + 1).padStart(2, '0')}`;
  function mergeEvents() {
    const unique = new Map([...state.manual, ...state.imported].map(e => [e.id, e]));
    state.events = [...unique.values()].sort((a, b) => a.date - b.date);
    render();
  }
  async function loadSportEasy() {
    const request = ++requestNumber;
    try {
      const response = await fetch(`/api/sporteasy-calendar?month=${monthKey()}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('unavailable');
      const payload = await response.json();
      if (request !== requestNumber) return;
      if (!Array.isArray(payload.events)) throw new Error('invalid');
      state.imported = payload.events.map(normalize).filter(Boolean);
      if (status) status.textContent = payload.sources?.some(s => !s.available || s.stale) ? 'Certaines catégories conservent leurs dernières données disponibles.' : '';
      mergeEvents();
    } catch {
      if (request !== requestNumber) return;
      if (status) status.textContent = 'Agenda SportEasy temporairement indisponible. Les événements déjà chargés restent consultables.';
      mergeEvents();
    }
  }
  const localDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const matches = event => visible(event, state.active, state.type);
  const onDay = (event, date) => event.days.first ? event.days.first <= localDay(date) && event.days.last >= localDay(date) : sameDay(event.date, date);
  const itemFor = event => CATEGORY[event.category] || { label: 'Club', color: '#d51f52' };
  function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
  function monthEvents(){return state.events.filter(event => matches(event) && event.days.first <= localDay(new Date(state.month.getFullYear(),state.month.getMonth()+1,0)) && event.days.last >= localDay(state.month))}
  function renderFilters(){
    filters.innerHTML = [['all',{label:'Toutes',color:'#d51f52'}],...Object.entries(CATEGORY)].map(([key,item]) => `<button class="rcc-calendar-filter" type="button" data-category="${key}" aria-pressed="${state.active===key}" style="--category-color:${item.color}">${item.label}</button>`).join('');
    if (typeFilters) typeFilters.innerHTML = Object.entries(TYPES).map(([key,label]) => `<button class="rcc-calendar-filter" type="button" data-event-type="${key}" aria-pressed="${state.type===key}" style="--category-color:#d51f52">${label}</button>`).join('');
  }
  function eventButton(event, compact=false){
    const item=itemFor(event);
    return `<button class="${compact?'rcc-mobile-event':'rcc-calendar-event'}" type="button" data-event-id="${escapeHtml(event.id)}" style="--category-color:${item.color}"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml([event.time,event.type].filter(Boolean).join(' · '))}</small></button>`;
  }
  function renderDesktop(){
    const year=state.month.getFullYear(), month=state.month.getMonth();
    const first=new Date(year,month,1); const offset=(first.getDay()+6)%7; const start=new Date(year,month,1-offset);
    const today=new Date(); let html='';
    for(let i=0;i<42;i++){
      const date=new Date(start); date.setDate(start.getDate()+i);
      const events=state.events.filter(event=>onDay(event,date)&&matches(event));
      html += `<article class="rcc-calendar-day${date.getMonth()!==month?' is-outside':''}${sameDay(date,today)?' is-today':''}" data-date="${localDay(date)}"><div class="rcc-calendar-date">${date.getDate()}</div><div class="rcc-calendar-day-events">${events.slice(0,3).map(event=>eventButton(event)).join('')}${events.length>3?`<button type="button" class="rcc-calendar-more" data-calendar-day="${localDay(date)}">+ ${events.length-3} autres</button>`:''}</div></article>`;
    }
    grid.innerHTML=html;
  }
  function renderMobile(){
    const events=monthEvents().sort((a,b)=>a.date-b.date);
    if(!events.length){mobile.innerHTML='<p class="empty-state">Aucun événement pour ce mois.</p>';return;}
    const groups=new Map();
    for (let day=1;day<=new Date(state.month.getFullYear(),state.month.getMonth()+1,0).getDate();day++) {
      const date=new Date(state.month.getFullYear(),state.month.getMonth(),day);
      const items=events.filter(e=>onDay(e,date)); if(items.length)groups.set(localDay(date),items);
    }
    mobile.innerHTML=[...groups.entries()].map(([key,items])=>{const date=new Date(`${key}T12:00:00`);return `<article class="rcc-mobile-day"><div class="rcc-mobile-day-date">${date.getDate()}<small>${dayFormatter.format(date).replace('.','')}</small></div><div class="rcc-mobile-events">${items.map(event=>eventButton(event,true)).join('')}</div></article>`}).join('');
  }
  function render(){
    const parts = monthFormatter.formatToParts(state.month);
    const monthLabel = parts.find((part) => part.type === 'month')?.value || '';
    const yearLabel = parts.find((part) => part.type === 'year')?.value || '';
    title.innerHTML = `<span class="rcc-calendar-month">${escapeHtml(monthLabel)}</span><span class="rcc-calendar-year">${escapeHtml(yearLabel)}</span>`;
    renderFilters();
    renderDesktop();
    renderMobile();
  }
  function openEvent(id){
    const event=state.events.find(item=>String(item.id)===String(id)); if(!event||!dialog)return;
    const item=itemFor(event);
    const labels=event.categories.map(c=>CATEGORY[c].label).join(', ') || item.label;
    const rows=[['Date',dateFormatter.format(new Date(`${event.days.first}T12:00:00`))],['Jusqu’au',event.days.last!==event.days.first?dateFormatter.format(new Date(`${event.days.last}T12:00:00`)):''],['Heure',event.time],['Catégorie',labels],['Type',event.type],['Compétition',event.competition],['Lieu',event.location]].filter(([,v])=>v);
    dialogContent.innerHTML=`<article class="rcc-event-detail" style="--category-color:${item.color}"><span class="rcc-event-detail-category">${escapeHtml(labels)}</span><h3 id="event-dialog-title">${escapeHtml(event.title)}</h3><dl class="rcc-event-detail-list">${rows.map(([k,v])=>`<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>${event.description?`<p class="rcc-event-detail-description">${escapeHtml(event.description)}</p>`:''}</article>`;
    dialog.showModal ? dialog.showModal() : dialog.setAttribute('open','');
  }
  filters.addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;state.active=button.dataset.category;render()});
  typeFilters?.addEventListener('click',event=>{const button=event.target.closest('[data-event-type]');if(!button)return;state.type=button.dataset.eventType;render()});
  grid.addEventListener('click',event=>{const button=event.target.closest('[data-calendar-day]');if(!button)return;dialogContent.innerHTML=`<h3 id="event-dialog-title">${escapeHtml(dateFormatter.format(new Date(`${button.dataset.calendarDay}T12:00:00`)))}</h3>${state.events.filter(e=>matches(e)&&onDay(e,new Date(`${button.dataset.calendarDay}T12:00:00`))).map(e=>eventButton(e,true)).join('')}`;dialog.showModal()});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-event-id]');if(button)openEvent(button.dataset.eventId)});
  prev?.addEventListener('click',()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()-1,1);render();loadSportEasy()});
  next?.addEventListener('click',()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()+1,1);render();loadSportEasy()});
  todayButton?.addEventListener('click',()=>{const now=new Date();state.month=new Date(now.getFullYear(),now.getMonth(),1);render();loadSportEasy()});
  closeDialog?.addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  loadEvents().then(events=>{state.manual=events;mergeEvents()});
  loadSportEasy();
})();
