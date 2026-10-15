export const WEEK = 7 * 24 * 60 * 60 * 1000;
export const KEY = 'standings:2026-2027:v1';
export const GROUPS = [
  { id: 'seniors', label: 'Seniors', competition: 23947, phase: '50143', source: 'https://monclubhouse.ffr.fr/regionales/nouvelle-aquitaine/nouvelle-aquitaine-regionale-3-championnat-territorial/qualification-50143/73076/classements' },
  { id: 'cadets', label: 'Cadets', competition: 24012, phase: '50230', source: 'https://monclubhouse.ffr.fr/regionales/nouvelle-aquitaine/nouvelle-aquitaine-regional-2-u16/qualification-50230/73244/classements' },
  { id: 'cadettes', label: 'Cadettes', competition: 24051, phase: '50321', source: 'https://monclubhouse.ffr.fr/clubs/r-c-cubzaguais/competitions/nouvelle-aquitaine-feminines-regionales-a-x-moins-de-18-ans-championnat-territorial/qualification-50321/classements' }
];
const query = `query Competitions($id: [Int!], $structures: [ID]) {
  competitions: Competitions(id: $id) { id saison: Saison { nom }
    phases: Phases(structures: $structures) { id nom
      pools: ClassementsIntraPoule(structures: $structures) { id
        rows: Classements { position
          team: Equipe { id nom structure: Structure { id } regroupement: Regroupement { structures: StructuresItem { id } } }
          stats: Classement { pointTerrain joues gagnes nuls perdus bonusOffensif bonusDefensif }
        }
      }
    }
  }
}`;
const isRcc = (team) => String(team?.structure?.id) === '1472'
  || team?.regroupement?.structures?.some((s) => String(s.id) === '1472');

export function normalize(data, group) {
  if (data.errors?.length) throw new Error('FFR_GRAPHQL_ERROR');
  const competition = data.data?.competitions?.find((c) => String(c.id) === String(group.competition));
  if (competition?.saison?.nom !== '2026-2027') throw new Error('FFR_WRONG_SEASON');
  const phase = competition.phases?.find((p) => String(p.id) === group.phase);
  const pools = phase?.pools?.filter((p) => p.rows?.some((r) => isRcc(r.team))) || [];
  if (pools.length !== 1) throw new Error('FFR_AMBIGUOUS_POOL');
  const rows = pools[0].rows.map((r) => {
    if (!r.team?.nom || !Number.isInteger(r.position) || r.position < 1) throw new Error('FFR_INVALID_ROW');
    const stats = {};
    for (const field of ['pointTerrain', 'joues', 'gagnes', 'nuls', 'perdus', 'bonusOffensif', 'bonusDefensif']) {
      const value = r.stats?.[field];
      if (value == null && field.startsWith('bonus')) { stats[field] = null; continue; }
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('FFR_INVALID_STATS');
      if (field !== 'pointTerrain' && (!Number.isInteger(value) || value < 0)) throw new Error('FFR_INVALID_STATS');
      stats[field] = value;
    }
    if (stats.joues !== stats.gagnes + stats.nuls + stats.perdus) throw new Error('FFR_INVALID_TOTAL');
    return { position: r.position, name: r.team.nom, rcc: Boolean(isRcc(r.team)), ...stats };
  });
  return { ...group, pool: String(pools[0].id), phaseName: phase.nom, rows: rows.sort((a, b) => a.position - b.position) };
}

export async function updateStandings(env, fetcher = fetch, now = Date.now()) {
  if (!env.RCC_STANDINGS) throw new Error('RCC_STANDINGS binding missing');
  const previous = await env.RCC_STANDINGS.get(KEY, 'json');
  const groups = [];
  for (const group of GROUPS) {
    try {
      const response = await fetcher('https://api-agregateur.ffr.fr/graphql', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id: [group.competition], structures: ['1472'] } }),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error('FFR_HTTP_ERROR');
      groups.push({ ...normalize(await response.json(), group), updatedAt: new Date(now).toISOString(), stale: false });
    } catch {
      const old = previous?.groups?.find((g) => g.id === group.id);
      groups.push({ ...(old || { ...group, rows: [] }), stale: true });
    }
  }
  const result = { season: '2026-2027', attemptedAt: new Date(now).toISOString(), groups };
  // No expiry: a failed fetch must never erase the last valid table.
  await env.RCC_STANDINGS.put(KEY, JSON.stringify(result));
  return result;
}
