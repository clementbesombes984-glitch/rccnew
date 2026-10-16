import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PAGE_ID, UPSERT, eligible, normalizePost, syncFacebook, persistImage, mediaUrl } from '../integrations/meta/facebook-import.js';
import { onRequestGet as feed } from '../functions/api/facebook-news.js';
import { onRequestGet as image } from '../functions/api/facebook-media/[id].js';

const sql = new DatabaseSync(':memory:');
sql.exec(await readFile(new URL('../migrations/facebook/0001_posts.sql', import.meta.url), 'utf8'));
function d1() {
  return { prepare(query) {
    let args = [];
    const statement = { bind(...values) { args = values; return statement; },
      async run() { const result = sql.prepare(query).run(...args); return { meta: { changes: Number(result.changes) } }; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async first() { return sql.prepare(query).get(...args) || null; } };
    return statement;
  } };
}
const objects = new Map();
const bucket = { async put(key, bytes, metadata) { objects.set(key, { body: bytes, ...metadata }); }, async get(key) { return objects.get(key); } };
const env = { RCC_FACEBOOK_DB: d1(), RCC_FACEBOOK_MEDIA: bucket, RCC_FACEBOOK_SYNC_ENABLED: 'true',
  RCC_FACEBOOK_READ_ENABLED: 'true', RCC_FACEBOOK_PAGE_TOKEN: 'fixture-not-a-real-token' };
const post = { id: `${PAGE_ID}_123`, message: 'Victoire RCC !\nTexte complet #ActuRCC', created_time: '2026-10-15T10:00:00+0000', permalink_url: 'https://www.facebook.com/example/posts/123' };
for (const text of ['#ActuRCC', '#acturcc', '#ACTURCC', 'Bonjour (#ActuRCC)']) assert(eligible(text));
for (const text of ['#ActuRCCbis', '#ActuRCC2026', 'mot#ActuRCC', '#ActuRCCé', 'RCC']) assert(!eligible(text));
assert.equal(normalizePost(post).body, 'Victoire RCC !\nTexte complet');
assert.equal(normalizePost({ ...post, created_time: '2999-01-01' }), null);
assert.equal(normalizePost({ ...post, is_published: false }), null);
assert.equal(normalizePost({ ...post, permalink_url: 'javascript:alert(1)' }), null);
let calls = [];
let current = [post, { ...post, id: `${PAGE_ID}_124`, message: 'Sans hashtag' }];
const fetcher = async (url, options) => {
  calls.push(String(url));
  assert(String(url).startsWith('https://graph.facebook.com/v25.0/'));
  assert(!String(url).includes(env.RCC_FACEBOOK_PAGE_TOKEN));
  assert.equal(options.headers.Authorization, `Bearer ${env.RCC_FACEBOOK_PAGE_TOKEN}`);
  return Response.json({ data: current });
};
assert.equal((await syncFacebook({})).status, 'disabled');
await syncFacebook(env, fetcher);
await syncFacebook({ ...env, RCC_FACEBOOK_DB: d1() }, fetcher); // restarted importer, same persistent store
assert.equal(sql.prepare('SELECT count(*) n FROM facebook_posts').get().n, 1);
const fenced = await env.RCC_FACEBOOK_DB.prepare(UPSERT).bind(post.id, PAGE_ID, 'stale', 'stale',
  new Date().toISOString(), post.permalink_url, '', 1, new Date().toISOString(), 'expired-owner', Date.now()).run();
assert.equal(fenced.meta.changes, 0, 'A stale process cannot modify an existing article');
assert.equal(sql.prepare('SELECT image_key FROM facebook_posts').get().image_key, '');
const overlapping = await Promise.all([syncFacebook(env, fetcher), syncFacebook(env, fetcher)]);
assert(overlapping.some((result) => result.status === 'busy'));
assert.equal(sql.prepare('SELECT count(*) n FROM facebook_posts').get().n, 1);
current = [{ ...post, message: 'Texte modifié #ACTURCC' }];
await syncFacebook(env, fetcher);
assert.equal(sql.prepare('SELECT body FROM facebook_posts').get().body, 'Texte modifié');
current = [{ ...post, message: 'Hashtag retiré' }];
await syncFacebook(env, fetcher);
assert.equal(sql.prepare('SELECT active FROM facebook_posts').get().active, 0);
current = [post];
await syncFacebook(env, fetcher);
for (const failing of [async () => Response.json({ error: { code: 190, message: 'secret must never be logged' } }, { status: 400 }), async () => { throw new Error('sensitive transport detail'); }]) {
  await assert.rejects(() => syncFacebook(env, failing), (error) => ['meta_token_invalid', 'meta_network'].includes(error.code) && !error.message.includes('secret'));
  assert.equal(sql.prepare('SELECT active FROM facebook_posts').get().active, 1);
  assert.equal(sql.prepare('SELECT count(*) n FROM facebook_sync_lock').get().n, 0);
}
// A missing/inaccessible known post is not proof of deletion.
await syncFacebook(env, async (url) => String(url).includes('/posts?') ? Response.json({ data: [] }) : Response.json({ error: { code: 100 } }, { status: 400 }));
assert.equal(sql.prepare('SELECT active FROM facebook_posts').get().active, 1);
assert.equal(mediaUrl('https://fbcdn.net.evil.test/a'), null);
assert.equal(mediaUrl('http://scontent.fbcdn.net/a'), null);
assert.equal(mediaUrl('https://localhost/a'), null);
const png = new Uint8Array([137,80,78,71,13,10,26,10]);
const key = await persistImage('https://scontent.fbcdn.net/test', bucket, async () => new Response(png, { headers: { 'content-type': 'image/png' } }));
assert(objects.has(key));
await assert.rejects(() => persistImage('https://scontent.fbcdn.net/test', bucket, async () => new Response('<script>', { headers: { 'content-type': 'image/png' } })));
await assert.rejects(() => persistImage('https://scontent.fbcdn.net/test', bucket, async () => new Response('x', { headers: { 'content-type': 'image/png', 'content-length': '999999999' } })));
const request = (query = '') => new Request(`https://preview.example/api/facebook-news${query}`);
let response = await feed({ request: request(), env });
let data = await response.json();
assert.equal(data.news.length, 1);
assert.equal(data.news[0].notification, false);
assert.equal(data.news[0].source, 'facebook');
assert.equal(data.news[0].image, '');
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.equal((await (await feed({ request: request('?id=facebook-' + post.id), env })).json()).news.length, 1);
assert.equal((await feed({ request: request('?offset=-1'), env })).status, 400);
assert.equal((await (await feed({ request: request(), env: {} })).json()).news.length, 0);
assert.equal((await feed({ request: request(), env: { ...env, RCC_FACEBOOK_DB: { prepare() { throw new Error('private detail'); } } } })).status, 503);
assert.equal((await image({ params: { id: post.id }, env })).status, 404);
sql.prepare('UPDATE facebook_posts SET image_key=?').run(key);
assert.equal((await image({ params: { id: post.id }, env })).status, 200);
sql.prepare('UPDATE facebook_posts SET active=0').run();
assert.equal((await image({ params: { id: post.id }, env })).status, 404);
// The frontend is executed, not just searched: manual content survives an API outage.
const loader = await readFile(new URL('../data-loader.js', import.meta.url), 'utf8');
const testable = loader.replace("  document.addEventListener('DOMContentLoaded', () => {", "  window.testFacebook = { combinedNews, escapeHtml, facebookLink, renderArticlePage };\n  document.addEventListener('DOMContentLoaded', () => {");
const sandbox = { window: { location: { origin: 'https://preview.example' } }, document: { addEventListener() {} }, URL, AbortSignal, console,
  fetch: async (url) => url.startsWith('/data/news.json') ? Response.json({ news: [{ id: 'manual', title: 'Article conservé' }] }) : new Response('', { status: 503 }) };
vm.runInNewContext(testable, sandbox);
assert.equal((await sandbox.window.testFacebook.combinedNews())[0].id, 'manual');
assert.equal(sandbox.window.testFacebook.escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
assert.equal(sandbox.window.testFacebook.facebookLink({ source: 'facebook', facebookUrl: 'javascript:alert(1)' }), '');
const reader = { innerHTML: '', querySelector() { return null; } };
const articleSandbox = { ...sandbox, URLSearchParams,
  window: { location: { origin: 'https://preview.example', search: `?id=facebook-${post.id}` } },
  document: { addEventListener() {}, querySelector(selector) { return selector === '[data-article-page]' ? { querySelector() { return reader; } } : null; } },
  fetch: async (url) => url.startsWith('/data/') ? Response.json({ news: [] }) : Response.json({ news: [{
    id: `facebook-${post.id}`, source: 'facebook', title: '<img onerror=alert(1)>', body: '<script>alert(1)</script>',
    date: '2026-10-15', image: '', facebookUrl: post.permalink_url }], next: null }) };
vm.runInNewContext(testable, articleSandbox);
await articleSandbox.window.testFacebook.renderArticlePage();
assert(reader.innerHTML.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert(!reader.innerHTML.includes('<script>'));
assert(reader.innerHTML.includes('Voir sur Facebook'));
assert(!calls.some((url) => /push|github|notifications/.test(url)));
sql.close();
console.log('Facebook : hashtag, programmation simulée, SQLite idempotence/concurrence, modifications, retraits, pannes/token, R2, API et repli manuel/XSS : OK. Aucun appel distant ni push.');
