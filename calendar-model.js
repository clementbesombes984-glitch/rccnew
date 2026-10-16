export const CATEGORY = {
  M6: { label: 'M6', color: '#f1b633' }, M8: { label: 'M8', color: '#f1b633' },
  M10: { label: 'M10', color: '#f1b633' }, M12: { label: 'M12', color: '#f1b633' }, M14: { label: 'M14', color: '#f1b633' },
  M16: { label: 'M16', color: '#4f9cff' }, M19: { label: 'M19', color: '#4f9cff' },
  Cadettes: { label: 'Cadettes', color: '#b05cff' }, Seniors: { label: 'Seniors', color: '#d51f52' }
};
export const TYPES = { all: 'Tous', training: 'Entraînements', match: 'Matchs', other: 'Autres événements' };
export function categoriesFor(raw) {
  const explicit = (raw.categories || []).filter(c => CATEGORY[c]);
  if (explicit.length) return explicit;
  const labels = [...(raw.teams || []), raw.category, raw.categorie, raw.team, raw.equipe, raw.section, raw.group].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/cadettes?|feminin/.test(labels)) return ['Cadettes'];
  const matches = [...labels.matchAll(/\b[um](6|8|10|12|14|16|18|19)\b/g)].map(m => m[1] === '18' ? 'M19' : `M${m[1]}`);
  if (matches.length) return [...new Set(matches)];
  if (/ecole/.test(labels)) return ['M6', 'M8', 'M10', 'M12', 'M14'];
  if (/jeune|junior|cadet/.test(labels)) return ['M16', 'M19'];
  return /senior/.test(labels) ? ['Seniors'] : [];
}
export function typeFor(raw) {
  if (['training', 'match', 'other', 'unknown'].includes(raw.type)) return raw.type;
  const s = `${raw.type_evenement || raw.type || raw.eventType || raw.kind || raw.nature || ''} ${raw.title || raw.titre || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/entrainement|training/.test(s)) return 'training';
  if (/\b(match|championnat|vs)\b/.test(s)) return 'match';
  return /plateau|tournoi|stage|reunion|repas|fete|evenement/.test(s) ? 'other' : 'unknown';
}
const parisDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
export const parisDay = value => parisDayFormatter.format(new Date(value));
export function dayKeys(start, end, allDay) {
  const first = allDay ? start.slice(0, 10) : parisDay(start);
  // iCalendar DTEND is exclusive, including all-day events.
  const last = allDay ? new Date(Math.max(Date.parse(start), Date.parse(end) - 1)).toISOString().slice(0, 10) : parisDay(Math.max(Date.parse(start), Date.parse(end) - 1));
  return { first, last };
}
export function visible(event, category, type) {
  return (category === 'all' || event.categories.includes(category)) &&
    (type === 'all' || event.kind === type || (type === 'other' && event.kind === 'unknown'));
}
