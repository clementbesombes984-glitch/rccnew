// Inbound only. No GitHub, push, subscriptions or publishing credentials.
export const PAGE_ID = '1131153776758221';
const marker = () => /(?<![\p{L}\p{M}\p{N}_])#acturcc(?![\p{L}\p{M}\p{N}_])/giu;
export const eligible = (text) => marker().test(String(text || ''));
export function normalizePost(post, now = Date.now()) {
  if (!post || !new RegExp(`^${PAGE_ID}_\\d+$`).test(post.id || '') || post.is_published === false) return null;
  const date = Date.parse(post.created_time);
  if (!Number.isFinite(date) || date > now) return null;
  let link;
  try { link = new URL(post.permalink_url); } catch { return null; }
  if (link.protocol !== 'https:' || !(link.hostname === 'facebook.com' || link.hostname.endsWith('.facebook.com'))) return null;
  const body = String(post.message || '').replace(marker(), '').trim();
  const firstLine = body.split(/\r?\n/).find((line) => line.trim())?.trim() || '';
  const title = firstLine.length > 110 ? firstLine.slice(0, 109).trimEnd() + '…' : firstLine;
  return { id: post.id, title: title || 'Publication Facebook', body, date: new Date(date).toISOString(),
    permalink: link.href, active: eligible(post.message) ? 1 : 0, imageUrl: post.full_picture || '' };
}
export function publicPost(row) {
  return { id: `facebook-${row.facebook_id}`, source: 'facebook', title: row.title, body: row.body,
    summary: row.body.slice(0, 200), date: row.published_at, category: 'Club', notification: false,
    featured: false, facebookUrl: row.permalink,
    image: row.image_key ? `/api/facebook-media/${encodeURIComponent(row.facebook_id)}` : '' };
}
export class ImportError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export async function graph(path, token, params = {}, fetcher = fetch) {
  const url = new URL(`https://graph.facebook.com/v25.0/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response;
  try { response = await fetcher(url.href, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), redirect: 'error' }); }
  catch { throw new ImportError('meta_network'); }
  let data;
  try { data = await response.json(); } catch { throw new ImportError('meta_response'); }
  if (!response.ok || data.error) throw new ImportError(data.error?.code === 190 ? 'meta_token_invalid' : response.status === 429 ? 'meta_rate_limit' : 'meta_denied');
  return data;
}
export function mediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['fbcdn.net', 'fbsbx.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;
  } catch { return null; }
}
export async function persistImage(url, bucket, fetcher = fetch) {
  const safe = mediaUrl(url);
  if (!safe) throw new ImportError('media_host');
  const response = await fetcher(safe, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!response.ok || !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(type)) throw new ImportError('media_type');
  const max = 5 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > max || !response.body) throw new ImportError('media_size');
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new ImportError('media_size'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  // Reject mislabeled content; SVG/HTML never enters the media store.
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  const valid = type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : type === 'image/png' ? bytes[0] === 137 && ascii(1, 4) === 'PNG'
    : type === 'image/webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    : ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32));
  if (!valid) throw new ImportError('media_signature');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const key = `facebook/${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
  return key;
}
export const UPSERT = `INSERT INTO facebook_posts
 (facebook_id,page_id,title,body,published_at,permalink,image_key,active,checked_at)
 SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM facebook_sync_lock WHERE id=1 AND owner=? AND expires_at>?)
 ON CONFLICT(facebook_id) DO UPDATE SET title=excluded.title,body=excluded.body,
 published_at=excluded.published_at,permalink=excluded.permalink,image_key=excluded.image_key,
 active=excluded.active,checked_at=excluded.checked_at`;
export async function syncFacebook(env, fetcher = fetch) {
  if (env.RCC_FACEBOOK_SYNC_ENABLED !== 'true') return { status: 'disabled' };
  if (!env.RCC_FACEBOOK_DB || !env.RCC_FACEBOOK_MEDIA || !env.RCC_FACEBOOK_PAGE_TOKEN) throw new ImportError('configuration_missing');
  const db = env.RCC_FACEBOOK_DB;
  const owner = crypto.randomUUID();
  const started = Date.now();
  const lock = await db.prepare(`INSERT INTO facebook_sync_lock(id,owner,expires_at) VALUES(1,?,?)
    ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
    WHERE facebook_sync_lock.expires_at < ?`).bind(owner, started + 540000, started).run();
  if (!lock.meta.changes) return { status: 'busy' };
  try {
    const posts = new Map();
    let after;
    let more = false;
    for (let page = 0; page < 5; page++) {
      const data = await graph(`${PAGE_ID}/posts`, env.RCC_FACEBOOK_PAGE_TOKEN,
        { fields: 'id,message,created_time,permalink_url,full_picture', limit: '25', ...(after ? { after } : {}) }, fetcher);
      if (!Array.isArray(data.data)) throw new ImportError('meta_response');
      for (const post of data.data) posts.set(post.id, post);
      after = data.paging?.cursors?.after;
      more = Boolean(data.paging?.next && after);
      if (!more) break;
    }
    // Recheck old imported IDs too. Absence from /posts never means deletion.
    const known = await db.prepare('SELECT facebook_id FROM facebook_posts ORDER BY checked_at ASC LIMIT 10').all();
    for (const row of known.results) {
      if (posts.has(row.facebook_id)) continue;
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
    let mediaErrors = 0;
    for (const source of posts.values()) {
      if (Date.now() - started > 240000) { more = true; break; }
      const post = normalizePost(source);
      if (!post) continue;
      const old = await db.prepare('SELECT image_key FROM facebook_posts WHERE facebook_id=?').bind(post.id).first();
      if (!post.active && !old) continue;
      let key = '';
      if (post.active && post.imageUrl) {
        try { key = await persistImage(post.imageUrl, env.RCC_FACEBOOK_MEDIA, fetcher); }
        catch { mediaErrors++; key = old?.image_key || ''; }
      }
      const write = await db.prepare(UPSERT).bind(post.id, PAGE_ID, post.title, post.body, post.date,
        post.permalink, key, post.active, new Date().toISOString(), owner, Date.now()).run();
      imported += write.meta.changes;
      // Content-addressed shared images are not deleted here: cleanup is a separate operation.
    }
    return { status: 'ok', processed: imported, mediaErrors, truncated: more };
  } finally {
    await db.prepare('DELETE FROM facebook_sync_lock WHERE id=1 AND owner=?').bind(owner).run();
  }
}
