import ICAL from 'ical.js';

export const CATEGORIES = ['M6', 'M8', 'M10', 'M12', 'M14', 'M16', 'M19', 'Cadettes', 'Seniors'];
const text = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function eventType(value) {
  const s = text(value);
  if (/\b(entrainement|training|entrainements)\b/.test(s)) return 'training';
  if (/\b(match|matches|matchs|championnat|vs)\b|🆚/.test(s)) return 'match';
  if (/\b(plateaux?|tournois?|stages?|reunions?|repas|fetes?|assemblees?|evenements?|ateliers?|rassemblements?)\b/.test(s)) return 'other';
  return 'unknown';
}
// Only scheduling fields are eligible. Never copy DESCRIPTION, ATTENDEE, ORGANIZER,
// CONTACT, URL, alarms or arbitrary X-properties to storage or the public API.
export function publicText(value, limit = 240) {
  const s = String(value || '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (s.length > limit || /https?:|webcal:|www\.|@|(?:\+\d|\b0[1-9])(?:[ .()-]*\d){8,}|(?:calendar|app)\.sporteasy|\b(?:token|password|secret)\b/i.test(s) ||
      /\b(?:joueurs?|participants?|convoqu[eé]s?|pr[eé]sen(?:ce|t[se]?)s?|absen(?:ce|t[se]?)s?|bless(?:ures?|[eé]s?)|m[eé]dical|t[eé]l[eé]phone|covoiturage|contact|priv[eé]e?s?)\b/i.test(s)) return '';
  return s;
}
const epoch = (time, component) => {
  if (time.isDate) return Date.UTC(time.year, time.month - 1, time.day);
  if (time.zone?.tzid !== 'floating') return time.toUnixTime() * 1000;
  const tz = component.getFirstProperty('dtstart')?.getParameter('tzid') || 'Europe/Paris';
  // Intl supplies current IANA rules if the feed omits VTIMEZONE. Floating SportEasy
  // times are explicitly interpreted in the club timezone, not the server's UTC.
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  const shown = utc => {
    const p = Object.fromEntries(fmt.formatToParts(utc).map(p => [p.type, p.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  };
  const before = wall - 86400000, after = wall + 86400000;
  const offsets = [...new Set([shown(before) - before, shown(after) - after])];
  const candidates = offsets.map(offset => wall - offset).filter(utc => shown(utc) === wall);
  // RFC 5545: first occurrence of an ambiguous wall time; pre-gap offset for a
  // nonexistent spring-forward wall time.
  return candidates.length ? Math.min(...candidates) : wall - offsets[0];
};
export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export async function parseCalendar(ics, category, now = Date.now()) {
  if (!CATEGORIES.includes(category) || typeof ics !== 'string' || ics.length > 2000000 || !ics.trimEnd().endsWith('END:VCALENDAR')) throw new Error('invalid_calendar');
  const root = new ICAL.Component(ICAL.parse(ics));
  if (root.name !== 'vcalendar') throw new Error('invalid_calendar');
  const components = root.getAllSubcomponents('vevent');
  if (!components.length || components.length > 2000) throw new Error('empty_or_large_calendar');
  const lower = now - 183 * 86400000, upper = now + 550 * 86400000;
  const records = [], hashes = new Map();
  let iterations = 0, withheld = 0, cancelled = 0;
  // Resolve duplicate revisions deterministically before expansion, preserving exceptions.
  const revisions = new Map();
  for (const c of components) {
    const uid = c.getFirstPropertyValue('uid');
    if (!uid) throw new Error('invalid_event');
    if (!c.hasProperty('dtstart') && c.getFirstPropertyValue('status') === 'CANCELLED' && c.hasProperty('recurrence-id')) c.addPropertyWithValue('dtstart', c.getFirstPropertyValue('recurrence-id').clone());
    if (!c.hasProperty('dtstart') && c.getFirstPropertyValue('status') !== 'CANCELLED') throw new Error('invalid_event');
    const key = `${uid}|${c.getFirstPropertyValue('recurrence-id') || ''}`;
    const old = revisions.get(key);
    if (!old || +(c.getFirstPropertyValue('sequence') || 0) >= +(old.getFirstPropertyValue('sequence') || 0)) revisions.set(key, c);
  }
  const selected = [...revisions.values()];
  for (const c of selected.filter(c => !c.hasProperty('recurrence-id'))) {
    const uid = c.getFirstPropertyValue('uid');
    const exceptions = selected.filter(e => e.hasProperty('recurrence-id') && e.getFirstPropertyValue('uid') === uid);
    if (c.getFirstPropertyValue('status') === 'CANCELLED') { cancelled++; continue; }
    const event = new ICAL.Event(c, { exceptions });
    const recurring = event.isRecurring();
    const iterator = recurring ? event.iterator() : null;
    let occurrence = recurring ? iterator.next() : event.startDate;
    while (occurrence) {
      if (++iterations > 10000 || records.length >= 2000) throw new Error('expansion_limit');
      const details = recurring ? event.getOccurrenceDetails(occurrence) : { item: event, startDate: event.startDate, endDate: event.endDate };
      const item = details.item, start = epoch(details.startDate, item.component), end = epoch(details.endDate, item.component);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('invalid_event_time');
      if (recurring && epoch(occurrence, c) > upper) break;
      if (item.component.getFirstPropertyValue('status') === 'CANCELLED') cancelled++;
      else if (!recurring || (end >= lower && start <= upper)) {
        const title = publicText(item.summary);
        const privacy = item.component.getFirstPropertyValue('class');
        if (!title || privacy === 'PRIVATE' || privacy === 'CONFIDENTIAL') withheld++;
        else {
          if (!hashes.has(uid)) hashes.set(uid, digest(uid));
          records.push({ uidHash: hashes.get(uid), title, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
            allDay: details.startDate.isDate, location: publicText(item.location), categories: [category],
            type: eventType(`${item.summary} ${item.component.getAllProperties('categories').flatMap(p => p.getValues()).join(' ')}`),
            description: '', notification: false, source: 'sporteasy' });
        }
      }
      occurrence = recurring ? iterator.next() : null;
    }
  }
  // A series exception without its master cannot be expanded safely. Keep last valid data.
  if (selected.some(c => c.hasProperty('recurrence-id') && !selected.some(m => !m.hasProperty('recurrence-id') && m.getFirstPropertyValue('uid') === c.getFirstPropertyValue('uid')))) throw new Error('orphan_exception');
  const unique = new Map();
  for (const r of records) {
    const hash = await r.uidHash;
    const { uidHash, ...event } = r;
    const id = `se-${hash}-${event.start}`;
    unique.set(id, { id, ...event });
  }
  return { events: [...unique.values()], rawCount: components.length, withheld, cancelled };
}

export function feedConfig(secret) {
  let feeds;
  try { feeds = JSON.parse(secret); } catch { throw new Error('feed_configuration'); }
  for (const category of CATEGORIES) {
    const url = new URL(String(feeds[category] || '').replace(/^webcal:/, 'https:'));
    if (url.protocol !== 'https:' || url.hostname !== 'calendar.sporteasy.net' || url.port || url.username || url.password || url.search || url.hash || !/^\/icalendars\/team\/\d+\/[a-f0-9]{32}\.ics$/.test(url.pathname)) throw new Error('feed_configuration');
    feeds[category] = url.href;
  }
  return feeds;
}
export async function syncCalendars(env, fetcher = fetch, now = Date.now()) {
  if (env.RCC_SPORTEASY_SYNC_ENABLED !== 'true') return { status: 'disabled' };
  if (!env.RCC_SPORTEASY_KV) throw new Error('storage_missing');
  const feeds = feedConfig(env.RCC_SPORTEASY_FEEDS);
  const results = [];
  // Sequential categories keep peak memory and concurrent outgoing connections bounded.
  for (const category of CATEGORIES) {
    try {
      const response = await fetcher(feeds[category], { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { Accept: 'text/calendar' } });
      if (!response.ok) { await response.body?.cancel(); throw new Error('feed_http'); }
      const reader = response.body.getReader(); let size = 0; const chunks = [];
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 2000000) { await reader.cancel(); throw new Error('feed_size'); }
        chunks.push(value);
      }
      const body = new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
      const hash = await digest(body);
      const key = `calendar:${category}`;
      const old = await env.RCC_SPORTEASY_KV.get(key, 'json');
      const day = new Date(now).toISOString().slice(0, 10);
      if (old?.formatVersion === 1 && old.hash === hash && old.expandedDay === day) {
        await env.RCC_SPORTEASY_KV.put(`checked:${category}`, JSON.stringify({ checkedAt: new Date(now).toISOString() }));
        results.push({ category, status: 'unchanged', events: old.events.length, raw: old.rawCount });
        continue;
      }
      const parsed = await parseCalendar(body, category, now);
      await env.RCC_SPORTEASY_KV.put(key, JSON.stringify({ ...parsed, formatVersion: 1, hash, expandedDay: day, syncedAt: new Date(now).toISOString() }));
      results.push({ category, status: 'ok', events: parsed.events.length, raw: parsed.rawCount, withheld: parsed.withheld, cancelled: parsed.cancelled });
    } catch {
      // Deliberately no exception message, URL, ICS or personal fields in logs.
      results.push({ category, status: 'retained_last_valid' });
    }
  }
  return { status: results.every(r => r.status !== 'retained_last_valid') ? 'ok' : 'partial', results };
}
