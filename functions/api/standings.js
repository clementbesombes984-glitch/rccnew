import { GROUPS, KEY, WEEK, updateStandings } from '../_lib/standings.js';

export async function onRequestGet({ env, waitUntil }) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (!env.RCC_STANDINGS) return new Response(JSON.stringify({ season: '2026-2027', groups: GROUPS.map((g) => ({ ...g, rows: [], stale: true })) }), { headers });
  try {
    let saved = await env.RCC_STANDINGS.get(KEY, 'json');
    if (!saved) saved = await updateStandings(env);
    else if (Date.now() - Date.parse(saved.attemptedAt) > WEEK) waitUntil(updateStandings(env));
    return new Response(JSON.stringify({ ...saved, groups: saved.groups.map((g) => ({ ...g, stale: g.stale || !g.updatedAt || Date.now() - Date.parse(g.updatedAt) > WEEK })) }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: 'Classements temporairement indisponibles.' }), { status: 503, headers });
  }
}
