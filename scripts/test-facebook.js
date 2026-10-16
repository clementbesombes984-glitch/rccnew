import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PAGE_ID, UPSERT, eligible, normalizePost, syncFacebook, mediaUrl, graph } from '../integrations/meta/facebook-import.js';
import syncWorker from '../workers/facebook-sync.js';
import { onRequestGet as feed } from '../functions/api/facebook-news.js';

const sql = new DatabaseSync(':memory:');
sql.exec(await readFile(new URL('../migrations/facebook/0001_posts.sql', import.meta.url), 'utf8'));
sql.exec("INSERT INTO facebook_posts VALUES ('legacy','page','Title','Body','2026-10-15','https://facebook.com/test','',1,'2026-10-15')");
sql.exec(await readFile(new URL('../migrations/facebook/0002_direct_image_url.sql', import.meta.url), 'utf8'));
assert.equal(sql.prepare("SELECT body,image_url FROM facebook_posts WHERE facebook_id='legacy'").get().body, 'Body');
assert.equal(sql.prepare("SELECT image_url FROM facebook_posts WHERE facebook_id='legacy'").get().image_url, '');
sql.exec("DELETE FROM facebook_posts WHERE facebook_id='legacy'");
let queryCount = 0;
function d1() {
  return { prepare(query) {
    let args = [];
    const statement = { bind(...values) { args = values; return statement; },
      async run() { queryCount++; const result = sql.prepare(query).run(...args); return { meta: { changes: Number(result.changes) } }; },
      async all() { queryCount++; return { results: sql.prepare(query).all(...args) }; },
      async first() { queryCount++; return sql.prepare(query).get(...args) || null; } };
    return statement;
  } };
}
const env = { RCC_FACEBOOK_DB: d1(), RCC_FACEBOOK_SYNC_ENABLED: 'true',
  RCC_FACEBOOK_READ_ENABLED: 'true', RCC_FACEBOOK_PAGE_TOKEN: 'fixture-not-a-real-token' };
const manualNews = await readFile(new URL('../data/news.json', import.meta.url), 'utf8');
assert.equal(JSON.parse(manualNews).news.length, 13, 'Keep the 13 existing manual articles');
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
  assert.equal(options.redirect, 'manual');
  new Request(url, options);
  return Response.json({ data: current });
};
assert.equal((await syncFacebook({})).status, 'disabled');
const firstSync = await syncFacebook(env, fetcher);
assert.deepEqual([firstSync.received, firstSync.examined, firstSync.matching, firstSync.rejected, firstSync.pages,
  firstSync.created, firstSync.updated], [2, 2, 1, 1, 1, 1, 0]);
assert(Number.isFinite(firstSync.durationMs) && firstSync.durationMs >= 0);
const secondSync = await syncFacebook({ ...env, RCC_FACEBOOK_DB: d1() }, fetcher); // restarted importer, same persistent store
assert.deepEqual([secondSync.created, secondSync.updated, secondSync.processed], [0, 1, 1]);
// Repeated marker tests cannot retain the lastIndex of a global regexp.
for (let i = 0; i < 100; i++) assert(eligible('#ActuRCC'));
// Irrelevant posts must not pay for permalink/image/date/title normalization.
const irrelevant = { id: `${PAGE_ID}_999`, message: 'Sans marqueur',
  get permalink_url() { throw new Error('Unnecessary URL work'); },
  get full_picture() { throw new Error('Unnecessary image work'); },
  get created_time() { throw new Error('Unnecessary date work'); } };
const filtered = await syncFacebook(env, async (url) => String(url).includes('/posts?') ?
  { status: 200, ok: true, json: async () => ({ data: [post, irrelevant] }) } : Response.json(post));
assert.equal(filtered.rejected, 1);
assert.equal(filtered.examined, 2);
assert.equal(sql.prepare('SELECT count(*) n FROM facebook_posts').get().n, 1);
const fenced = await env.RCC_FACEBOOK_DB.prepare(UPSERT).bind(post.id, PAGE_ID, 'stale', 'stale',
  new Date().toISOString(), post.permalink_url, '', 1, new Date().toISOString(), 'expired-owner', Date.now()).run();
assert.equal(fenced.meta.changes, 0, 'A stale process cannot modify an existing article');
assert.equal(sql.prepare('SELECT image_url FROM facebook_posts').get().image_url, '');
const overlapping = await Promise.all([syncFacebook(env, fetcher), syncFacebook(env, fetcher)]);
assert(overlapping.some((result) => result.status === 'busy'));
assert.equal(sql.prepare('SELECT count(*) n FROM facebook_posts').get().n, 1);
current = [{ ...post, message: 'Texte modifié #ACTURCC' }];
await syncFacebook(env, fetcher);
assert.equal(sql.prepare('SELECT body FROM facebook_posts').get().body, 'Texte modifié');
current = [{ ...post, message: 'Hashtag retiré' }];
const withdrawn = await syncFacebook(env, fetcher);
assert.deepEqual([withdrawn.matching, withdrawn.rejected, withdrawn.updated], [0, 0, 1]);
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
assert.equal(mediaUrl('https://scontent.fbcdn.net/test?access_token=secret'), null);
assert.equal(mediaUrl('https://scontent.fbcdn.net/test#secret'), null);
const firstImage = 'https://scontent.fbcdn.net/photo.jpg?oe=expired';
current = [{ ...post, full_picture: firstImage }];
await syncFacebook(env, fetcher);
assert.equal(sql.prepare('SELECT image_url FROM facebook_posts').get().image_url, firstImage);
current = [{ ...post, full_picture: 'https://scontent.fbcdn.net/photo.jpg?oe=renewed' }];
const renewedImage = await syncFacebook(env, fetcher);
assert.deepEqual([renewedImage.created, renewedImage.updated], [0, 1]);
assert.equal(sql.prepare('SELECT image_url FROM facebook_posts').get().image_url, current[0].full_picture);
current = [{ ...post, full_picture: `https://scontent.fbcdn.net/${env.RCC_FACEBOOK_PAGE_TOKEN}` }];
await syncFacebook(env, fetcher);
assert.equal(sql.prepare('SELECT image_url FROM facebook_posts').get().image_url, '');
current = [{ ...post, full_picture: 'javascript:alert(1)' }];
await syncFacebook(env, fetcher);
assert.equal(sql.prepare('SELECT count(*) n FROM facebook_posts').get().n, 1);
assert.equal(sql.prepare('SELECT image_url FROM facebook_posts').get().image_url, '');
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
current = [{ ...post, full_picture: firstImage }];
await syncFacebook(env, fetcher);
data = await (await feed({ request: request(), env })).json();
assert.equal(data.news[0].image, firstImage);
assert(!JSON.stringify(data).includes(env.RCC_FACEBOOK_PAGE_TOKEN));
sql.prepare('UPDATE facebook_posts SET image_url=?').run('https://evil.example/image');
assert.equal((await (await feed({ request: request(), env })).json()).news[0].image, '');
// The frontend is executed, not just searched: manual content survives an API outage.
const loader = await readFile(new URL('../data-loader.js', import.meta.url), 'utf8');
const testable = loader.replace("  document.addEventListener('DOMContentLoaded', () => {", "  window.testFacebook = { combinedNews, escapeHtml, facebookLink, renderArticlePage, activateFacebookImages, facebookCardImage };\n  document.addEventListener('DOMContentLoaded', () => {");
const sandbox = { window: { location: { origin: 'https://preview.example' } }, document: { addEventListener() {} }, URL, AbortSignal, console,
  fetch: async (url) => url.startsWith('/data/news.json') ? Response.json({ news: [{ id: 'manual', title: 'Article conservé' }] }) : new Response('', { status: 503 }) };
vm.runInNewContext(testable, sandbox);
assert.equal((await sandbox.window.testFacebook.combinedNews())[0].id, 'manual');
assert.equal(sandbox.window.testFacebook.escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
assert.equal(sandbox.window.testFacebook.facebookLink({ source: 'facebook', facebookUrl: 'javascript:alert(1)' }), '');
const reader = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
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
// Expired images keep a readable card and article fallback; no retries or token use.
let probe;
let removedMark = false;
let removedAttribute = false;
const card = { style: {}, getAttribute: () => firstImage, classList: { remove() {} },
  querySelector: () => ({ remove() { removedMark = true; } }), removeAttribute() { removedAttribute = true; } };
sandbox.Image = class { constructor() { probe = this; } };
sandbox.window.testFacebook.activateFacebookImages({ querySelectorAll: (selector) => selector === '[data-facebook-background]' ? [card] : [] });
assert.equal(probe.referrerPolicy, 'no-referrer');
probe.onerror();
assert(removedAttribute);
assert(!removedMark);
assert.equal(card.style.backgroundImage, undefined);
sandbox.window.testFacebook.activateFacebookImages({ querySelectorAll: (selector) => selector === '[data-facebook-background]' ? [card] : [] });
probe.onload();
assert(removedMark);
assert(card.style.backgroundImage.includes('scontent.fbcdn.net'));
let articleFallback = false;
let imageRemoved = false;
let fallbackMark = '';
sandbox.document.createElement = () => ({ textContent: '' });
const brokenImage = { complete: true, naturalWidth: 0, addEventListener() {}, remove() { imageRemoved = true; },
  parentElement: { classList: { add(name) { articleFallback = name === 'article-image-fallback'; } }, appendChild(mark) { fallbackMark = mark.textContent; } } };
sandbox.window.testFacebook.activateFacebookImages({ querySelectorAll: (selector) => selector === 'img[data-facebook-direct-image]' ? [brokenImage] : [] });
assert(articleFallback && imageRemoved);
assert.equal(fallbackMark, 'RCC');
assert(sandbox.window.testFacebook.facebookCardImage({ image: '' }, 'journal-image').includes('<strong>RCC</strong>'));
assert(!calls.some((url) => /push|github|notifications/.test(url)));
// HTTP failures, JavaScript failures, timeout and body decoding must not be conflated.
for (const [status, payload, expected] of [
  [401, { error: { code: 190, error_subcode: 463, message: 'do-not-log-secret' } }, 'meta_token_invalid'],
  [403, { error: { code: 200, message: 'do-not-log-secret' } }, 'meta_permission_denied'],
  [429, { error: { code: 4 } }, 'meta_rate_limit'],
  [503, { error: { code: 2 } }, 'meta_unavailable'],
  [400, { error: { code: 100 } }, 'meta_denied']
]) {
  await assert.rejects(() => graph(`${PAGE_ID}/posts`, 'fixture', {}, async () => Response.json(payload, { status })),
    (error) => error.code === expected && error.diagnostics.httpStatus === status && !JSON.stringify(error).includes('do-not-log-secret'));
}
for (const status of [302, 307, 308]) {
  let fetchCount = 0;
  await assert.rejects(() => graph(`${PAGE_ID}/posts`, 'fixture', {}, async (_url, init) => {
    fetchCount++;
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status, headers: { Location: 'https://evil.invalid/?access_token=secret-must-not-leak' } });
  }), (error) => error.code === 'meta_redirect' && error.diagnostics.httpStatus === status && !JSON.stringify(error).includes('secret-must-not-leak'));
  assert.equal(fetchCount, 1);
}
await assert.rejects(() => graph(`${PAGE_ID}/posts`, 'fixture', {}, async () => new Response('<html>private detail</html>', { status: 502 })),
  (error) => error.code === 'meta_unavailable' && error.diagnostics.httpStatus === 502);
await assert.rejects(() => graph(`${PAGE_ID}/posts`, 'fixture', {}, async () => new Response('not json')),
  (error) => error.code === 'meta_response' && error.diagnostics.stage === 'body');
await assert.rejects(() => graph(`${PAGE_ID}/posts`, 'fixture', {}, async () => { throw new DOMException('secret', 'TimeoutError'); }),
  (error) => error.code === 'meta_timeout' && error.diagnostics.exceptionType === 'TimeoutError');
await assert.rejects(() => graph(`${PAGE_ID}/posts`, 'bad\r\nsecret', {}, async () => { throw new Error('Must not dispatch'); }),
  (error) => error.code === 'meta_request_invalid' && error.diagnostics.stage === 'request');
await assert.rejects(() => graph(`${PAGE_ID}/posts`, 'fixture', {}, async () => { const error = new Error('secret'); error.name = 'secret'; throw error; }),
  (error) => error.code === 'meta_network' && error.diagnostics.exceptionType === 'Other');
await assert.rejects(() => graph(`${PAGE_ID}/posts`, 'fixture', {}, async () => ({ status: 200, ok: true, json: async () => { throw new DOMException('secret', 'AbortError'); } })),
  (error) => error.code === 'meta_timeout' && error.diagnostics.stage === 'body');
// Worker logs contain only controlled classification/numeric diagnostics, never messages or URLs.
const previousFetch = globalThis.fetch;
const previousError = console.error;
const errorLogs = [];
try {
  globalThis.fetch = async () => Response.json({ error: { code: 190, message: env.RCC_FACEBOOK_PAGE_TOKEN, error_data: 'https://example.invalid/?token=secret' } }, { status: 401 });
  console.error = (value) => errorLogs.push(value);
  let task;
  await syncWorker.scheduled({}, env, { waitUntil(value) { task = value; } });
  await task;
} finally { globalThis.fetch = previousFetch; console.error = previousError; }
assert.equal(JSON.parse(errorLogs[0]).diagnostics.httpStatus, 401);
assert(!errorLogs.join('').includes(env.RCC_FACEBOOK_PAGE_TOKEN));
assert(!errorLogs.join('').includes('example.invalid'));
assert.equal(JSON.parse(errorLogs[0]).received, 0);
assert.equal(JSON.parse(errorLogs[0]).created, 0);
assert(Number.isFinite(JSON.parse(errorLogs[0]).durationMs));
// Storage errors remain sanitized, preserve existing articles and release the lease.
const beforeFailure = sql.prepare('SELECT count(*) n FROM facebook_posts').get().n;
const brokenDb = { prepare(query) {
  if (query.startsWith('SELECT facebook_id FROM')) throw new Error('private database details');
  return env.RCC_FACEBOOK_DB.prepare(query);
} };
await assert.rejects(() => syncFacebook({ ...env, RCC_FACEBOOK_DB: brokenDb }, fetcher),
  error => error.code === 'storage_or_internal' && error.stats.pages === 1 && !JSON.stringify(error).includes('private'));
assert.equal(sql.prepare('SELECT count(*) n FROM facebook_posts').get().n, beforeFailure);
assert.equal(sql.prepare('SELECT count(*) n FROM facebook_sync_lock').get().n, 0);
const writeFailure = { prepare(query) {
  if (query.startsWith('INSERT INTO facebook_posts')) throw new Error('private write failure');
  return env.RCC_FACEBOOK_DB.prepare(query);
} };
await assert.rejects(() => syncFacebook({ ...env, RCC_FACEBOOK_DB: writeFailure }, fetcher),
  error => error.code === 'storage_or_internal' && error.stats.created === 0 && !JSON.stringify(error).includes('private'));
assert.equal(sql.prepare('SELECT count(*) n FROM facebook_posts').get().n, beforeFailure);
assert.equal(sql.prepare('SELECT count(*) n FROM facebook_sync_lock').get().n, 0);
const successLogs = [];
const previousLog = console.log;
try {
  globalThis.fetch = fetcher;
  console.log = value => successLogs.push(value);
  let task;
  await syncWorker.scheduled({}, env, { waitUntil(value) { task = value; } });
  await task;
} finally { globalThis.fetch = previousFetch; console.log = previousLog; }
const successLog = JSON.parse(successLogs[0]);
assert.equal(successLog.status, 'ok');
for (const field of ['received', 'matching', 'rejected', 'examined', 'pages', 'rechecked', 'created', 'updated', 'durationMs'])
  assert(Number.isFinite(successLog[field]), field);
assert.equal(successLog.processed, successLog.created + successLog.updated);
assert(!successLogs.join('').includes(env.RCC_FACEBOOK_PAGE_TOKEN));
assert(!successLogs.join('').includes('https://'));
// Bounded Free-plan batches must eventually drain, not forever reimport the first 15.
sql.exec('DELETE FROM facebook_posts');
const backlog = Array.from({ length: 75 }, (_, i) => ({ ...post, id: `${PAGE_ID}_${1000 + i}` }));
for (let pass = 0; pass < 5; pass++) {
  queryCount = 0;
  let externalCount = 0;
  const result = await syncFacebook(env, async (url) => {
    externalCount++;
    const page = Number(new URL(url).searchParams.get('after') || 0);
    return Response.json({ data: backlog.slice(page * 25, (page + 1) * 25),
      ...(page < 2 ? { paging: { next: 'ignored-not-followed', cursors: { after: String(page + 1) } } } : {}) });
  });
  assert.equal(result.processed, 15);
  assert.equal(result.received, 75);
  assert.equal(result.examined, 75);
  assert.equal(result.matching, 75);
  assert.equal(result.pages, 3);
  assert.equal(result.created, 15);
  assert.equal(result.updated, 0);
  assert(queryCount + externalCount < 50, 'Bound D1 and network subrequests for Workers Free');
  assert.equal(sql.prepare('SELECT count(*) n FROM facebook_posts').get().n, (pass + 1) * 15);
}
assert.equal(await readFile(new URL('../data/news.json', import.meta.url), 'utf8'), manualNews);
sql.close();
console.log('Facebook sans R2 : migration additive, hashtag, SQLite idempotence/concurrence, images absentes/expirées/renouvelées, token, API, repli manuel et XSS : OK. Aucun appel distant ni push.');
