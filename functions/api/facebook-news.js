import { publicPost, PAGE_ID } from '../../integrations/meta/facebook-import.js';
export async function onRequestGet({ request, env }) {
  const headers = { 'Cache-Control': 'no-store' };
  if (env.RCC_FACEBOOK_READ_ENABLED !== 'true' || !env.RCC_FACEBOOK_DB) return Response.json({ news: [], next: null }, { headers });
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id && !new RegExp(`^facebook-${PAGE_ID}_\\d+$`).test(id)) return Response.json({ error: 'Identifiant invalide.' }, { status: 400, headers });
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20)) | 0;
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000) return Response.json({ error: 'Pagination invalide.' }, { status: 400, headers });
    const statement = id
      ? env.RCC_FACEBOOK_DB.prepare('SELECT * FROM facebook_posts WHERE active=1 AND facebook_id=?').bind(id.slice(9))
      : env.RCC_FACEBOOK_DB.prepare('SELECT * FROM facebook_posts WHERE active=1 ORDER BY published_at DESC,facebook_id DESC LIMIT ? OFFSET ?').bind(limit + 1, offset);
    const { results } = await statement.all();
    return Response.json({ news: results.slice(0, id ? 1 : limit).map(publicPost),
      next: !id && results.length > limit ? offset + limit : null }, { headers });
  } catch { return Response.json({ news: [], next: null, unavailable: true }, { status: 503, headers }); }
}
