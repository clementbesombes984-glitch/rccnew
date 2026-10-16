// Inbound only. No GitHub, push, subscriptions or publishing credentials.
export const PAGE_ID = '1131153776758221';
const marker = () => /(?<![\p{L}\p{M}\p{N}_])#acturcc(?![\p{L}\p{M}\p{N}_])/giu;
const markerTest = /(?<![\p{L}\p{M}\p{N}_])#acturcc(?![\p{L}\p{M}\p{N}_])/iu;
const pagePostId = new RegExp(`^${PAGE_ID}_\\d+$`);
export const eligible = (text) => typeof text === 'string' && markerTest.test(text);
export function normalizePost(post, now = Date.now(), active = eligible(post?.message)) {
  if (!post || !pagePostId.test(post.id || '') || post.is_published === false) return null;
  const date = Date.parse(post.created_time);
  if (!Number.isFinite(date) || date > now) return null;
  let link;
  try { link = new URL(post.permalink_url); } catch { return null; }
  if (link.protocol !== 'https:' || !(link.hostname === 'facebook.com' || link.hostname.endsWith('.facebook.com'))) return null;
  const body = String(post.message || '').replace(marker(), '').trim();
  const firstLine = body.split(/\r?\n/).find((line) => line.trim())?.trim() || '';
  const title = firstLine.length > 110 ? firstLine.slice(0, 109).trimEnd() + '…' : firstLine;
  return { id: post.id, title: title || 'Publication Facebook', body, date: new Date(date).toISOString(),
    permalink: link.href, active: active ? 1 : 0, imageUrl: mediaUrl(post.full_picture) || '' };
}
export function publicPost(row) {
  return { id: `facebook-${row.facebook_id}`, source: 'facebook', title: row.title, body: row.body,
    summary: row.body.slice(0, 200), date: row.published_at, category: 'Club', notification: false,
    featured: false, facebookUrl: row.permalink,
    image: mediaUrl(row.image_url) || '' };
}
export class ImportError extends Error {
  constructor(code, diagnostics = {}) { super(code); this.code = code; this.diagnostics = diagnostics; }
}
const exceptionType = (error) => ['TypeError', 'Error', 'AbortError', 'TimeoutError', 'SyntaxError'].includes(error?.name) ? error.name : 'Other';
const httpError = (status, code) => code === 190 || status === 401 ? 'meta_token_invalid'
  : status === 429 || [4, 17, 32, 613].includes(code) ? 'meta_rate_limit'
  : status === 403 ? 'meta_permission_denied' : status >= 500 ? 'meta_unavailable' : 'meta_denied';
export async function graph(path, token, params = {}, fetcher = fetch) {
  const url = new URL(`https://graph.facebook.com/v25.0/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let init;
  try {
    init = { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), redirect: 'manual' };
    // Validate construction separately: workerd rejects redirect:"error" before any network I/O.
    new Request(url.href, init);
  } catch (error) { throw new ImportError('meta_request_invalid', { stage: 'request', exceptionType: exceptionType(error) }); }
  let response;
  try { response = await fetcher(url.href, init); }
  catch (error) { throw new ImportError(['TimeoutError', 'AbortError'].includes(error?.name) ? 'meta_timeout' : 'meta_network',
    { stage: 'transport', exceptionType: exceptionType(error) }); }
  const status = response.status;
  if (status >= 300 && status < 400) {
    await response.body?.cancel().catch(() => {});
    // Never follow Location or forward Authorization, even to another Meta endpoint.
    throw new ImportError('meta_redirect', { stage: 'response', httpStatus: status });
  }
  let data;
  try { data = await response.json(); }
  catch (error) {
    const code = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'meta_timeout' : !response.ok ? httpError(status) : 'meta_response';
    throw new ImportError(code, { stage: 'body', httpStatus: status, exceptionType: exceptionType(error) });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ImportError('meta_response', { stage: 'body', httpStatus: status });
  if (!response.ok || data.error) {
    const metaCode = Number.isSafeInteger(data.error?.code) ? data.error.code : undefined;
    const metaSubcode = Number.isSafeInteger(data.error?.error_subcode) ? data.error.error_subcode : undefined;
    throw new ImportError(httpError(status, metaCode), { stage: 'response', httpStatus: status,
      ...(metaCode !== undefined ? { metaCode } : {}), ...(metaSubcode !== undefined ? { metaSubcode } : {}) });
  }
  return data;
}
export function mediaUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      ![...url.searchParams.keys()].some((key) => /token|appsecret|authorization/i.test(key)) &&
      ['fbcdn.net', 'fbsbx.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;
  } catch { return null; }
}
export const UPSERT = `INSERT INTO facebook_posts
 (facebook_id,page_id,title,body,published_at,permalink,image_url,active,checked_at)
 SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM facebook_sync_lock WHERE id=1 AND owner=? AND expires_at>?)
 ON CONFLICT(facebook_id) DO UPDATE SET title=excluded.title,body=excluded.body,
 published_at=excluded.published_at,permalink=excluded.permalink,image_url=excluded.image_url,
 active=excluded.active,checked_at=excluded.checked_at`;
export async function syncFacebook(env, fetcher = fetch) {
  if (env.RCC_FACEBOOK_SYNC_ENABLED !== 'true') return { status: 'disabled' };
  if (!env.RCC_FACEBOOK_DB || !env.RCC_FACEBOOK_PAGE_TOKEN) throw new ImportError('configuration_missing');
  const db = env.RCC_FACEBOOK_DB;
  const owner = crypto.randomUUID();
  const started = Date.now();
  const stats = { received: 0, matching: 0, rejected: 0, examined: 0, pages: 0,
    rechecked: 0, created: 0, updated: 0, unchanged: 0 };
  const lock = await db.prepare(`INSERT INTO facebook_sync_lock(id,owner,expires_at) VALUES(1,?,?)
    ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
    WHERE facebook_sync_lock.expires_at < ?`).bind(owner, started + 540000, started).run();
  if (!lock.meta.changes) return { status: 'busy' };
  try {
    const posts = new Map();
    let after;
    let more = false;
    for (let page = 0; page < 3; page++) {
      const data = await graph(`${PAGE_ID}/posts`, env.RCC_FACEBOOK_PAGE_TOKEN,
        { fields: 'id,message,created_time,permalink_url,full_picture', limit: '25', ...(after ? { after } : {}) }, fetcher);
      if (!Array.isArray(data.data)) throw new ImportError('meta_response');
      stats.pages++;
      stats.received += data.data.length;
      for (const post of data.data) posts.set(post.id, post);
      after = data.paging?.cursors?.after;
      more = Boolean(data.paging?.next && after);
      if (!more) break;
    }
    // Recheck old imported IDs too. Absence from /posts never means deletion.
    const known = await db.prepare('SELECT facebook_id FROM facebook_posts ORDER BY checked_at ASC LIMIT 10').all();
    for (const row of known.results) {
      if (posts.has(row.facebook_id)) continue;
      stats.rechecked++;
      try {
        const post = await graph(row.facebook_id, env.RCC_FACEBOOK_PAGE_TOKEN,
          { fields: 'id,message,created_time,permalink_url,full_picture' }, fetcher);
        posts.set(post.id, post);
      } catch (error) {
        if (error.code !== 'meta_denied') throw error;
        // Deleted vs inaccessible is ambiguous: preserve data, rotate recheck.
        await db.prepare(`UPDATE facebook_posts SET checked_at=? WHERE facebook_id=?
          AND EXISTS(SELECT 1 FROM facebook_sync_lock WHERE owner=? AND expires_at>?)`)
          .bind(new Date().toISOString(), row.facebook_id, owner, Date.now()).run();
      }
    }
    let imported = 0;
    // Read identity/check order first, so irrelevant posts never parse dates, URLs or titles.
    // Include known IDs without a marker: removing the marker must still deactivate them.
    const ids = [...posts.keys()].filter((id) => pagePostId.test(id));
    const existing = ids.length ? await db.prepare(`SELECT facebook_id,checked_at,title,body,published_at,permalink,image_url,active FROM facebook_posts
      WHERE facebook_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all() : { results: [] };
    const previous = new Map(existing.results.map((row) => [row.facebook_id, row.checked_at]));
    const stored = new Map(existing.results.map(row => [row.facebook_id, row]));
    const candidates = [];
    const now = Date.now();
    for (const source of posts.values()) {
      stats.examined++;
      const active = eligible(source?.message);
      if (active) stats.matching++;
      if (!active && !previous.has(source?.id)) { stats.rejected++; continue; }
      const post = normalizePost(source, now, active);
      if (post) candidates.push(post);
      else stats.rejected++;
    }
    // Bound D1 queries/subrequests for Workers Free. New imports first, then oldest checks.
    const pending = candidates.sort((a, b) =>
      Number(previous.has(a.id)) - Number(previous.has(b.id)) ||
      ((previous.get(a.id) || '') < (previous.get(b.id) || '') ? -1 : (previous.get(a.id) || '') > (previous.get(b.id) || '') ? 1 : 0));
    if (pending.length > 15) more = true;
    for (const post of pending.slice(0, 15)) {
      if (Date.now() - started > 240000) { more = true; break; }
      // Store only a validated CDN URL, never the Page token or a fetched image.
      const imageUrl = post.active && !post.imageUrl.includes(env.RCC_FACEBOOK_PAGE_TOKEN) ? post.imageUrl : '';
      const old = stored.get(post.id);
      if (old && old.title === post.title && old.body === post.body && old.published_at === post.date &&
          old.permalink === post.permalink && old.image_url === imageUrl && old.active === post.active) {
        // Preserve rotation and fencing without rewriting unchanged text/media columns.
        const check = await db.prepare(`UPDATE facebook_posts SET checked_at=? WHERE facebook_id=?
          AND EXISTS(SELECT 1 FROM facebook_sync_lock WHERE id=1 AND owner=? AND expires_at>?)`)
          .bind(new Date().toISOString(), post.id, owner, Date.now()).run();
        stats.unchanged += check.meta.changes;
        continue;
      }
      const write = await db.prepare(UPSERT).bind(post.id, PAGE_ID, post.title, post.body, post.date,
        post.permalink, imageUrl, post.active, new Date().toISOString(), owner, Date.now()).run();
      imported += write.meta.changes;
      if (write.meta.changes) stats[previous.has(post.id) ? 'updated' : 'created']++;
    }
    return { status: 'ok', processed: imported, truncated: more, ...stats, durationMs: Date.now() - started };
  } catch (error) {
    // Never attach an arbitrary storage/transport message to the public log record.
    const safe = error instanceof ImportError ? error : new ImportError('storage_or_internal');
    safe.stats = { ...stats, durationMs: Date.now() - started };
    throw safe;
  } finally {
    await db.prepare('DELETE FROM facebook_sync_lock WHERE id=1 AND owner=?').bind(owner).run();
  }
}
