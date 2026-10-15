import assert from 'node:assert/strict';
import { GROUPS, KEY, normalize, updateStandings } from '../functions/_lib/standings.js';
import { onRequestGet } from '../functions/api/standings.js';

// Synthetic fixtures only; never shipped as published standings.
const fixture = (group) => ({ data: { competitions: [{ id: group.competition, saison: { nom: '2026-2027' }, phases: [{ id: group.phase, nom: 'Qualification', pools: [{ id: 'test', rows: [
  { position: 1, team: { nom: 'Test RCC', structure: { id: '1472' } }, stats: { pointTerrain: 4, joues: 1, gagnes: 1, nuls: 0, perdus: 0, bonusOffensif: null, bonusDefensif: 0 } }
] }] }] }] } });
assert.equal(normalize(fixture(GROUPS[0]), GROUPS[0]).rows[0].rcc, true);
const bad = fixture(GROUPS[0]); bad.data.competitions[0].saison.nom = '2025-2026';
assert.throws(() => normalize(bad, GROUPS[0]), /WRONG_SEASON/);
assert.throws(() => normalize({ errors: ['error'] }, GROUPS[0]));
const ambiguous = fixture(GROUPS[0]); ambiguous.data.competitions[0].phases[0].pools.push(ambiguous.data.competitions[0].phases[0].pools[0]);
assert.throws(() => normalize(ambiguous, GROUPS[0]), /AMBIGUOUS_POOL/);
const invalid = fixture(GROUPS[0]); invalid.data.competitions[0].phases[0].pools[0].rows[0].stats.joues = 9;
assert.throws(() => normalize(invalid, GROUPS[0]), /INVALID_TOTAL/);
let stored;
const env = { RCC_STANDINGS: { get: async () => stored, put: async (key, value) => { assert.equal(key, KEY); stored = JSON.parse(value); } } };
const fetcher = async (_url, options) => ({ ok: true, json: async () => fixture(GROUPS.find((g) => g.competition === JSON.parse(options.body).variables.id[0])) });
await updateStandings(env, fetcher, 1000);
assert.equal(stored.groups.length, 3);
const valid = structuredClone(stored);
await updateStandings(env, async () => { throw new Error('offline'); }, 2000);
assert(stored.groups.every((g) => g.stale));
assert.deepEqual(stored.groups.map((g) => g.rows), valid.groups.map((g) => g.rows));
assert.deepEqual(stored.groups.map((g) => g.updatedAt), valid.groups.map((g) => g.updatedAt));
await updateStandings(env, async (url, options) => {
  if (JSON.parse(options.body).variables.id[0] === GROUPS[1].competition) return { ok: false };
  return fetcher(url, options);
}, 3000);
assert.equal(stored.groups[0].stale, false);
assert.equal(stored.groups[1].stale, true);
assert.equal(stored.groups[1].updatedAt, valid.groups[1].updatedAt);
const regroupement = fixture(GROUPS[0]);
const team = regroupement.data.competitions[0].phases[0].pools[0].rows[0].team;
team.structure = null; team.regroupement = { structures: [{ id: '1472' }] };
assert.equal(normalize(regroupement, GROUPS[0]).rows[0].rcc, true);
const noBinding = await onRequestGet({ env: {} });
assert.equal((await noBinding.json()).groups.length, 3);
const response = await onRequestGet({ env, waitUntil: (promise) => promise.catch(() => {}) });
assert.equal(response.status, 200);
assert.equal(response.headers.get('Cache-Control'), 'no-store');
console.log('Classements : normalisation, saison, poule ambiguë, totaux, panne, conservation et absence de binding validés.');
