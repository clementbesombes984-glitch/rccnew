(() => {
  const grid = document.querySelector('[data-calendar-grid]');
  if (!grid) return;

  const title = document.querySelector('[data-calendar-month-title]');
  const filters = document.querySelector('[data-calendar-filters]');
  const mobile = document.querySelector('[data-calendar-mobile]');
  const dialog = document.querySelector('[data-event-dialog]');
  const dialogContent = document.querySelector('[data-event-dialog-content]');
  const closeDialog = document.querySelector('[data-event-dialog-close]');
  const prev = document.querySelector('[data-calendar-prev]');
  const next = document.querySelector('[data-calendar-next]');
  const todayButton = document.querySelector('[data-calendar-today]');

  const CATEGORY = {
    seniors: { label: 'Seniors', color: '#d51f52' },
    cadettes: { label: 'Cadettes', color: '#b05cff' },
    jeunes: { label: 'Pôle Jeunes', color: '#4f9cff' },
    ecole: { label: 'École de Rugby', color: '#f1b633' }
  };
  const state = { month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), events: [], active: new Set(Object.keys(CATEGORY)) };
  const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
  const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' });

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
    const category = categoryFrom(raw.category || raw.categorie || raw.team || raw.equipe || raw.section || raw.group);
    const type = clean(raw.type || raw.eventType || raw.kind || raw.nature || 'Match');
    const home = clean(raw.home || raw.equipeDomicile || raw.host || raw.local);
    const away = clean(raw.away || raw.equipeExterieure || raw.guest || raw.visiteur || raw.opponent || raw.adversaire);
    const fallbackTitle = home && away ? `${home} – ${away}` : (away ? `RCC – ${away}` : type);
    return {
      id: raw.id || `event-${index}`,
      date,
      category,
      type,
      title: clean(raw.title || raw.titre || raw.name || raw.nom || fallbackTitle),
      time: clean(raw.time || raw.heure || raw.startTime),
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
  function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
  function monthEvents(){return state.events.filter(event => event.date.getFullYear()===state.month.getFullYear()&&event.date.getMonth()===state.month.getMonth()&&state.active.has(event.category))}
  function renderFilters(){
    filters.innerHTML = Object.entries(CATEGORY).map(([key,item]) => `<button class="rcc-calendar-filter" type="button" data-category="${key}" aria-pressed="${state.active.has(key)}" style="--category-color:${item.color}">${item.label}</button>`).join('');
  }
  function eventButton(event, compact=false){
    const item=CATEGORY[event.category];
    return `<button class="${compact?'rcc-mobile-event':'rcc-calendar-event'}" type="button" data-event-id="${event.id}" style="--category-color:${item.color}"><strong>${event.title}</strong><small>${[event.time,event.type].filter(Boolean).join(' · ')}</small></button>`;
  }
  function renderDesktop(){
    const year=state.month.getFullYear(), month=state.month.getMonth();
    const first=new Date(year,month,1); const offset=(first.getDay()+6)%7; const start=new Date(year,month,1-offset);
    const today=new Date(); let html='';
    for(let i=0;i<42;i++){
      const date=new Date(start); date.setDate(start.getDate()+i);
      const events=state.events.filter(event=>sameDay(event.date,date)&&state.active.has(event.category));
      html += `<article class="rcc-calendar-day${date.getMonth()!==month?' is-outside':''}${sameDay(date,today)?' is-today':''}" data-date="${date.toISOString().slice(0,10)}"><div class="rcc-calendar-date">${date.getDate()}</div><div class="rcc-calendar-day-events">${events.slice(0,3).map(event=>eventButton(event)).join('')}${events.length>3?`<span class="rcc-calendar-more">+ ${events.length-3} autre${events.length>4?'s':''}</span>`:''}</div></article>`;
    }
    grid.innerHTML=html;
  }
  function renderMobile(){
    const events=monthEvents().sort((a,b)=>a.date-b.date);
    if(!events.length){mobile.innerHTML='<p class="empty-state">Aucun événement pour ce mois.</p>';return;}
    const groups=new Map();
    events.forEach(event=>{const key=event.date.toISOString().slice(0,10);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(event)});
    mobile.innerHTML=[...groups.values()].map(items=>{const date=items[0].date;return `<article class="rcc-mobile-day"><div class="rcc-mobile-day-date">${date.getDate()}<small>${dayFormatter.format(date).replace('.','')}</small></div><div class="rcc-mobile-events">${items.map(event=>eventButton(event,true)).join('')}</div></article>`}).join('');
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
    const item=CATEGORY[event.category];
    const rows=[['Date',dateFormatter.format(event.date)],['Heure',event.time],['Catégorie',item.label],['Type',event.type],['Compétition',event.competition],['Lieu',event.location]].filter(([,v])=>v);
    dialogContent.innerHTML=`<article class="rcc-event-detail" style="--category-color:${item.color}"><span class="rcc-event-detail-category">${item.label}</span><h3 id="event-dialog-title">${event.title}</h3><dl class="rcc-event-detail-list">${rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${event.description?`<p class="rcc-event-detail-description">${event.description}</p>`:''}</article>`;
    dialog.showModal ? dialog.showModal() : dialog.setAttribute('open','');
  }
  filters.addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;const key=button.dataset.category;state.active.has(key)?state.active.delete(key):state.active.add(key);render()});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-event-id]');if(button)openEvent(button.dataset.eventId)});
  prev?.addEventListener('click',()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()-1,1);render()});
  next?.addEventListener('click',()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()+1,1);render()});
  todayButton?.addEventListener('click',()=>{const now=new Date();state.month=new Date(now.getFullYear(),now.getMonth(),1);render()});
  closeDialog?.addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  loadEvents().then(events=>{state.events=events;render()});
})();
