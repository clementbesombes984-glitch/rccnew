import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const loader = await readFile(new URL('../data-loader.js', import.meta.url), 'utf8');
const theme = (await readFile(new URL('../co-theme.js', import.meta.url), 'utf8'))
  .replace("  document.addEventListener('DOMContentLoaded', () => {", "  window.testHero = setupHero;\n  document.addEventListener('DOMContentLoaded', () => {");
const manual = JSON.parse(await readFile(new URL('../data/news.json', import.meta.url), 'utf8')).news;
const facebook = { id: 'facebook-1131153776758221_122129574831400436', source: 'facebook',
  title: 'La Brède — jour de match', date: '2026-10-14T08:01:32.000Z',
  image: 'https://scontent.xx.fbcdn.net/match.jpg', summary: 'La Brède Rugby contre RCC', notification: false };

function element() {
  const handlers = {}, attributes = {}, classes = new Set();
  return { handlers, attributes, children: [], hidden: false, style: {},
    classList: { add: x => classes.add(x), remove: x => classes.delete(x) },
    setAttribute(k, v) { attributes[k] = v; },
    addEventListener(k, fn) { handlers[k] = fn; },
    contains() { return false; },
    set innerHTML(html) { this.children = [...html.matchAll(/<button /g)].map(() => element()); },
    get innerHTML() { return ''; } };
}

async function harness(news = manual, imports = [facebook, facebook], outage = false) {
  const nodes = Object.fromEntries(['content', 'story', 'title', 'summary', 'meta', 'primary', 'controls', 'dots', 'previous', 'next']
    .map(name => [`[data-co-hero-${name}]`, element()]));
  const images = [element(), element()];
  const hero = { ...element(), querySelector: s => nodes[s], querySelectorAll: () => images };
  const intervals = new Map(); let clockId = 0, apiCalls = 0;
  const context = { URL, AbortSignal, console, document: { hidden: false, addEventListener() {},
    querySelector: s => s === '[data-co-hero]' ? hero : null },
    window: { location: { origin: 'https://rcc.example' }, matchMedia: () => ({ matches: false }),
      clearTimeout() {}, setTimeout(fn) { fn(); return 1; },
      clearInterval(id) { intervals.delete(id); }, setInterval(fn, delay) { intervals.set(++clockId, { fn, delay }); return clockId; } },
    fetch: async url => {
      if (url.startsWith('/data/news.json')) return Response.json({ news });
      assert(url.startsWith('/api/facebook-news'), 'Hero uses the same API as the news section');
      apiCalls++; return outage ? new Response('', { status: 503 }) : Response.json({ news: imports, next: null });
    } };
  vm.createContext(context); vm.runInContext(loader, context); vm.runInContext(theme, context);
  // The homepage grid and carousel start concurrently in the real page.
  const [combined] = await Promise.all([context.window.RCCNews.load(), context.window.testHero()]);
  const get = name => nodes[`[data-co-hero-${name}]`];
  return { context, combined, get, hero, images, intervals, apiCalls };
}

const snapshot = JSON.stringify(manual);
const run = await harness();
assert.equal(run.combined.length, manual.length + 1);
assert.equal(new Set(run.combined.map(x => x.id)).size, run.combined.length);
assert.equal(run.apiCalls, 1, 'Concurrent consumers share the initial Facebook request');
assert.equal(run.get('title').textContent, facebook.title);
assert.equal(run.get('story').href, `./actualite.html?id=${facebook.id}`);
assert.equal(run.get('primary').href, run.get('story').href);
assert(run.get('meta').textContent.includes('14 octobre 2026'), 'ISO Facebook dates remain visible');
assert.equal(run.images[1].src, facebook.image);
run.images[1].onload();
assert.equal(run.get('dots').children.length, 3, 'Preserve the three-article carousel');
assert.equal([...run.intervals.values()][0].delay, 6000, 'Preserve autoplay timing');
run.get('next').handlers.click();
const secondTitle = run.get('title').textContent;
assert.equal(secondTitle, [...manual].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0].title);
run.get('previous').handlers.click(); assert.equal(run.get('title').textContent, facebook.title);
run.get('dots').children[1].handlers.click(); assert.equal(run.get('title').textContent, secondTitle);
run.hero.handlers.mouseenter(); assert.equal(run.intervals.size, 0);
run.hero.handlers.mouseleave(); assert.equal(run.intervals.size, 1);
run.images[0].onerror(); assert.equal(run.images[0].src, './assets/uploads/img21739872392103.jpg');

const ordering = await harness([
  { id: 'offset', title: 'Newest by instant', date: '2026-10-14T07:30:00-02:00' },
  { id: 'hidden', title: 'Unpublished', date: '2027-01-01', published: false },
  { id: 'invalid', title: 'Undated', date: 'invalid' },
]);
assert.equal(ordering.get('title').textContent, 'Newest by instant');
ordering.get('next').handlers.click(); assert.equal(ordering.get('title').textContent, facebook.title);
assert.equal(ordering.get('dots').children.length, 3);
const failure = await harness(manual, [], true);
assert.equal(failure.combined.length, manual.length);
assert.equal(failure.get('title').textContent, secondTitle, 'Manual news survives a Facebook outage');
const duplicates = await harness([...manual, manual[0]], [facebook]);
assert.equal(duplicates.combined.length, manual.length + 1, 'Repeated manual IDs are also removed');
const empty = await harness([], []);
assert.equal(empty.get('controls').hidden, true);
assert.equal(JSON.stringify(manual), snapshot, 'The manual source is never changed');
console.log('Accueil : source commune, La Brède, tri chronologique, doublons, images/liens/dates, trois slides, flèches/points, pause et défilement 6 s, panne Facebook : OK.');
