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
// Invocation-local cache: no persisted clock/rotation state or cross-category data.
const epoch = (time, component, formatters = new Map()) => {
  if (time.isDate) return Date.UTC(time.year, time.month - 1, time.day);
  if (time.zone?.tzid !== 'floating') return time.toUnixTime() * 1000;
  const tz = component.getFirstProperty('dtstart')?.getParameter('tzid') || 'Europe/Paris';
  // Intl supplies current IANA rules if the feed omits VTIMEZONE. Floating SportEasy
  // times are explicitly interpreted in the club timezone, not the server's UTC.
  let fmt = formatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    formatters.set(tz, fmt);
  }
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
export async function parseCalendar(ics, category, now = Date.now(), options = {}) {
  const formatters = new Map();
  const toEpoch = (time, component) => epoch(time, component, formatters);
  const profile = options.profile;
  const mark = Date.now();
  if (!CATEGORIES.includes(category) || typeof ics !== 'string' || ics.length > 2000000 || !ics.trimEnd().endsWith('END:VCALENDAR')) throw new Error('invalid_calendar');
  const root = new ICAL.Component(ICAL.parse(ics));
  if (profile) profile.icalParseWallMs = Date.now() - mark;
  if (root.name !== 'vcalendar') throw new Error('invalid_calendar');
  const components = root.getAllSubcomponents('vevent');
  if (!components.length || components.length > 2000) throw new Error('empty_or_large_calendar');
  const lower = now - 183 * 86400000, upper = now + 550 * 86400000;
  const priority = options.mode === 'priority';
  const horizon = now + 30 * 86400000;
  const tracked = options.tracked || new Set();
  const processedHashes = [], withdrawnHashes = [];
  const records = [];
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
  const masters = new Set();
  const exceptionsByUid = new Map();
  for (const component of selected) {
    const uid = component.getFirstPropertyValue('uid');
    if (!component.hasProperty('recurrence-id')) masters.add(uid);
    else {
      if (!exceptionsByUid.has(uid)) exceptionsByUid.set(uid, []);
      exceptionsByUid.get(uid).push(component);
    }
  }
  if ([...exceptionsByUid.keys()].some(uid => !masters.has(uid))) throw new Error('orphan_exception');
  for (const c of selected.filter(c => !c.hasProperty('recurrence-id'))) {
    const uid = c.getFirstPropertyValue('uid');
    const exceptions = exceptionsByUid.get(uid) || [];
    // Stable UID hashes let a previously near event follow a move beyond J+30.
    const uidHash = await digest(uid);
    const follow = tracked.has(uidHash);
    if (c.getFirstPropertyValue('status') === 'CANCELLED') {
      cancelled++; processedHashes.push(uidHash); withdrawnHashes.push(uidHash); continue;
    }
    const event = new ICAL.Event(c, { exceptions });
    const recurring = event.isRecurring();
    if (priority && !recurring && !follow &&
        (toEpoch(event.endDate, c) < now || toEpoch(event.startDate, c) > horizon)) continue;
    processedHashes.push(uidHash);
    const iterator = recurring ? event.iterator() : null;
    let occurrence = recurring ? iterator.next() : event.startDate;
    while (occurrence) {
      if (++iterations > 10000 || records.length >= 2000) throw new Error('expansion_limit');
      const details = recurring ? event.getOccurrenceDetails(occurrence) : { item: event, startDate: event.startDate, endDate: event.endDate };
      const item = details.item, start = toEpoch(details.startDate, item.component), end = toEpoch(details.endDate, item.component);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('invalid_event_time');
      const recurrenceUpper = priority && !follow ? horizon : upper;
      const occurrenceTime = recurring ? toEpoch(occurrence, c) : start;
      if (recurring && occurrenceTime > recurrenceUpper) break;
      if (item.component.getFirstPropertyValue('status') === 'CANCELLED') cancelled++;
      else if (!recurring || (end >= (priority && !follow ? now : lower) && start <= recurrenceUpper) ||
          (priority && occurrenceTime >= now && occurrenceTime <= horizon)) {
        const title = publicText(item.summary);
        const privacy = item.component.getFirstPropertyValue('class');
        if (!title || privacy === 'PRIVATE' || privacy === 'CONFIDENTIAL') {
          withheld++; withdrawnHashes.push(uidHash);
        }
        else {
          records.push({ uidHash, title, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
            allDay: details.startDate.isDate, location: publicText(item.location), categories: [category],
            type: eventType(`${item.summary} ${item.component.getAllProperties('categories').flatMap(p => p.getValues()).join(' ')}`),
            description: '', notification: false, source: 'sporteasy' });
        }
      }
      occurrence = recurring ? iterator.next() : null;
    }
  }
  // A series exception without its master cannot be expanded safely. Keep last valid data.
  // Master/exception membership was validated once above, without quadratic scans.
  const unique = new Map();
  for (const r of records) {
    const hash = r.uidHash;
    const { uidHash, ...event } = r;
    const id = `se-${hash}-${event.start}`;
    unique.set(id, { id, ...event });
  }
  if (profile) {
    profile.parseAndExpandWallMs = Date.now() - mark;
    profile.occurrences = iterations;
    profile.uidDigests = masters.size;
    profile.timezoneFormatters = formatters.size;
  }
  return { events: [...unique.values()], rawCount: components.length, withheld, cancelled,
    processedHashes, withdrawnHashes };
}

const eventHash = event => /^se-([a-f0-9]{64})-/.exec(event.id)?.[1];
// Explicit public schema comparison avoids two JSON serializations per event.
// Includes every persisted public event field; property order is irrelevant.
export function sameCalendarEvent(a, b) {
  return ['id','title','start','end','allDay','location','type','description','notification','source'].every(key => a[key] === b[key]) &&
    Array.isArray(a.categories) && Array.isArray(b.categories) && a.categories.length === b.categories.length &&
    a.categories.every((category, index) => category === b.categories[index]);
}
export function reconcileCalendar(oldEvents, parsed, now, mode, tracked = new Set()) {
  const processed = new Set(parsed.processedHashes), withdrawn = new Set(parsed.withdrawnHashes);
  const incoming = new Map(parsed.events.map(event => [event.id, event]));
  const merged = new Map();
  for (const old of oldEvents) {
    const hash = eventHash(old);
    if (withdrawn.has(hash)) continue;
    // An absent UID is not proof of cancellation (a valid feed can be incomplete).
    // Keep archives outside the recurrence expansion window as well.
    const archive = Date.parse(old.end) < now - 183 * 86400000;
    const outsidePriority = Date.parse(old.end) < now || Date.parse(old.start) > now + 30 * 86400000;
    if (!processed.has(hash) || archive || (mode === 'priority' && outsidePriority && !tracked.has(hash))) merged.set(old.id, old);
  }
  for (const [id, event] of incoming) merged.set(id, event);
  let created = 0, updated = 0, removed = 0;
  const previous = new Map(oldEvents.map(event => [event.id, event]));
  for (const [id, event] of merged) {
    if (!previous.has(id)) created++;
    else if (!sameCalendarEvent(previous.get(id), event)) updated++;
  }
  for (const id of previous.keys()) if (!merged.has(id)) removed++;
  return { events: [...merged.values()], created, updated, removed };
}

export function feedConfig(secret, categories = CATEGORIES) {
  let feeds;
  try { feeds = JSON.parse(secret); } catch { throw new Error('feed_configuration'); }
  for (const category of categories) {
    const url = new URL(String(feeds[category] || '').replace(/^webcal:/, 'https:'));
    if (url.protocol !== 'https:' || url.hostname !== 'calendar.sporteasy.net' || url.port || url.username || url.password || url.search || url.hash || !/^\/icalendars\/team\/\d+\/[a-f0-9]{32}\.ics$/.test(url.pathname)) throw new Error('feed_configuration');
    feeds[category] = url.href;
  }
  return feeds;
}
// Cancel the timeout after the body has been consumed, including all error paths.
// AbortSignal.timeout cannot be cleared and formerly survived successful requests.
export async function downloadCalendar(url, fetcher = fetch, timers = globalThis) {
  const controller = new AbortController();
  const timeout = timers.setTimeout(() => controller.abort(), 20000);
  const profile = {};
  const start = Date.now();
  let reader;
  try {
    const response = await fetcher(url, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/calendar' } });
    profile.headersWallMs = Date.now() - start;
    // Presence only: never log/cache header values, which may contain private data.
    profile.httpStatus = response.status;
    profile.etagPresent = response.headers.has('etag');
    profile.lastModifiedPresent = response.headers.has('last-modified');
    if (!response.ok) { await response.body?.cancel(); throw new Error('feed_http'); }
    reader = response.body.getReader(); let size = 0;
    const decoder = new TextDecoder(); const chunks = [];
    const bodyStart = Date.now();
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      size += value.length;
      if (size > 2000000) { await reader.cancel(); throw new Error('feed_size'); }
      chunks.push(decoder.decode(value, {stream:true}));
    }
    chunks.push(decoder.decode());
    profile.bodyAndDecodeWallMs = Date.now() - bodyStart;
    profile.bytes = size;
    return {body:chunks.join(''), profile};
  } finally {
    timers.clearTimeout(timeout);
    reader?.releaseLock();
  }
}
export async function syncCalendars(env, fetcher = fetch, now = Date.now(), options = {}) {
  if (env.RCC_SPORTEASY_SYNC_ENABLED !== 'true') return { status: 'disabled' };
  if (!env.RCC_SPORTEASY_KV) throw new Error('storage_missing');
  const categories = options.category ? [options.category] : CATEGORIES;
  if (categories.some(category => !CATEGORIES.includes(category))) throw new Error('invalid_category');
  const feeds = feedConfig(env.RCC_SPORTEASY_FEEDS, categories);
  const results = [];
  // Sequential categories keep peak memory and concurrent outgoing connections bounded.
  for (const category of categories) {
    try {
      const {body, profile} = await downloadCalendar(feeds[category], fetcher);
      let mark = Date.now();
      const hash = await digest(body);
      profile.digestWallMs = Date.now() - mark;
      const key = `calendar:${category}`;
      // Read small metadata first: unchanged feeds need no JSON decoding of all events.
      // Older snapshots (and KV adapters without metadata) keep the original safe path.
      let old, legacyValue;
      let metadataHit = false;
      mark = Date.now();
      if (typeof env.RCC_SPORTEASY_KV.getWithMetadata === 'function') {
        const cached = await env.RCC_SPORTEASY_KV.getWithMetadata(key, 'stream');
        old = cached.metadata;
        metadataHit = Boolean(old);
        if (!old && cached.value) {
          legacyValue = typeof cached.value === 'string' ? cached.value : await new Response(cached.value).text();
          old = JSON.parse(legacyValue);
        } else await cached.value?.cancel?.();
      } else old = await env.RCC_SPORTEASY_KV.get(key, 'json');
      profile.metadataReadWallMs = Date.now() - mark;
      const day = new Date(now).toISOString().slice(0, 10);
      const mode = !options.mode ? 'legacy' : options.mode === 'full' || !old?.fullDay ? 'full' : 'priority';
      if (mode !== 'full' && old?.formatVersion === 1 && old.hash === hash && old.expandedDay === day) {
        // One-time metadata upgrade: preserve the exact stored snapshot and dates.
        if (legacyValue) await env.RCC_SPORTEASY_KV.put(key, legacyValue, {
          metadata: { formatVersion: 1, hash, expandedDay: day, eventCount: old.events.length, rawCount: old.rawCount }
        });
        await env.RCC_SPORTEASY_KV.put(`checked:${category}`, JSON.stringify({ checkedAt: new Date(now).toISOString() }));
        results.push({ category, status: 'unchanged', events: old.eventCount ?? old.events.length, raw: old.rawCount,
          metadataHit, metadataUpgraded: Boolean(legacyValue), parsed: false, mode,
          created: 0, updated: 0, removed: 0, snapshotWrites: legacyValue ? 1 : 0, checkWrites: 1, profile });
        continue;
      }
      const snapshot = mode === 'legacy' ? null : Array.isArray(old?.events) ? old : await env.RCC_SPORTEASY_KV.get(key, 'json');
      const oldEvents = snapshot?.events || [];
      const tracked = new Set(oldEvents.filter(event => Date.parse(event.end) >= now && Date.parse(event.start) <= now + 30 * 86400000).map(eventHash));
      const parsed = await parseCalendar(body, category, now, { mode, tracked, profile });
      mark = Date.now();
      const changes = mode === 'legacy' ? { events: parsed.events, created: 0, updated: 0, removed: 0 } : reconcileCalendar(oldEvents, parsed, now, mode, tracked);
      profile.compareWallMs = Date.now() - mark;
      const fullDay = mode === 'full' ? day : old?.fullDay;
      // Only byte-independent metadata changes (hash/day/counts) require a new
      // snapshot when the public events are equal. Daily window changes still write.
      const identical = mode !== 'legacy' && changes.created === 0 && changes.updated === 0 && changes.removed === 0 &&
        snapshot?.hash === hash && snapshot.expandedDay === day && snapshot.fullDay === fullDay &&
        snapshot.rawCount === parsed.rawCount && snapshot.withheld === parsed.withheld && snapshot.cancelled === parsed.cancelled;
      if (identical) {
        await env.RCC_SPORTEASY_KV.put(`checked:${category}`, JSON.stringify({checkedAt:new Date(now).toISOString()}));
        results.push({category,status:'unchanged',mode,events:changes.events.length,raw:parsed.rawCount,
          metadataHit,metadataUpgraded:false,parsed:true,created:0,updated:0,removed:0,snapshotWrites:0,checkWrites:1,profile});
        continue;
      }
      mark = Date.now();
      const serialized = JSON.stringify({ events: changes.events, rawCount: parsed.rawCount,
        withheld: parsed.withheld, cancelled: parsed.cancelled, formatVersion: 1, hash,
        expandedDay: day, ...(fullDay ? { fullDay } : {}), syncedAt: new Date(now).toISOString() });
      profile.serializeWallMs = Date.now() - mark;
      mark = Date.now();
      await env.RCC_SPORTEASY_KV.put(key, serialized, {
        metadata: { formatVersion: 1, hash, expandedDay: day, eventCount: changes.events.length, rawCount: parsed.rawCount,
          ...(fullDay ? { fullDay } : {}) }
      });
      profile.snapshotWriteWallMs = Date.now() - mark;
      results.push({ category, status: 'ok', events: changes.events.length, raw: parsed.rawCount, withheld: parsed.withheld, cancelled: parsed.cancelled,
        metadataHit, metadataUpgraded: false, parsed: true, mode,
        created: changes.created, updated: changes.updated, removed: changes.removed, snapshotWrites: 1, checkWrites: 0, profile });
    } catch {
      // Deliberately no exception message, URL, ICS or personal fields in logs.
      results.push({ category, status: 'retained_last_valid' });
    }
  }
  return { status: results.every(r => r.status !== 'retained_last_valid') ? 'ok' : 'partial', results };
}
