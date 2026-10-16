const categories = ['M6', 'M8', 'M10', 'M12', 'M14', 'M16', 'M19', 'Cadettes', 'Seniors'];
export async function onRequestGet({ env, request }) {
  const month = new URL(request.url).searchParams.get('month') || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: 'invalid_month' }, { status: 400 });
  const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (env.RCC_SPORTEASY_READ_ENABLED !== 'true' || !env.RCC_SPORTEASY_KV) return reply({ events: [], enabled: false });
  const [year, m] = month.split('-').map(Number);
  const from = Date.UTC(year, m - 1, -7), to = Date.UTC(year, m, 8);
  const events = new Map(), sources = [];
  await Promise.all(categories.map(async category => {
    try {
      const [snapshot, checked] = await Promise.all([env.RCC_SPORTEASY_KV.get(`calendar:${category}`, 'json'), env.RCC_SPORTEASY_KV.get(`checked:${category}`, 'json')]);
      if (!snapshot || !Array.isArray(snapshot.events)) { sources.push({ category, available: false }); return; }
      const lastChecked = Math.max(Date.parse(snapshot.syncedAt), Date.parse(checked?.checkedAt) || 0);
      sources.push({ category, available: true, syncedAt: snapshot.syncedAt, checkedAt: new Date(lastChecked).toISOString(), stale: Date.now() - lastChecked > 7200000 });
      for (const row of snapshot.events) {
        if (!/^se-[a-f0-9]{64}-/.test(row.id) || !Number.isFinite(Date.parse(row.start)) || !Number.isFinite(Date.parse(row.end)) || Date.parse(row.start) >= to || Date.parse(row.end) < from) continue;
        if (events.has(row.id)) { const old = events.get(row.id); if (!old.categories.includes(category)) old.categories.push(category); continue; }
        events.set(row.id, { id: row.id, title: row.title, start: row.start, end: row.end, allDay: row.allDay === true,
          location: row.location, type: ['training', 'match', 'other', 'unknown'].includes(row.type) ? row.type : 'unknown',
          categories: [category], description: '', source: 'sporteasy', notification: false });
      }
    } catch { sources.push({ category, available: false }); }
  }));
  return reply({ events: [...events.values()].sort((a, b) => a.start.localeCompare(b.start)), sources: sources.sort((a, b) => categories.indexOf(a.category) - categories.indexOf(b.category)), enabled: true });
}
