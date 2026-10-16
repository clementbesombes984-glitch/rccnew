import { PAGE_ID } from '../../../integrations/meta/facebook-import.js';
export async function onRequestGet({ params, env }) {
  if (env.RCC_FACEBOOK_READ_ENABLED !== 'true' || !env.RCC_FACEBOOK_DB || !env.RCC_FACEBOOK_MEDIA ||
    !new RegExp(`^${PAGE_ID}_\\d+$`).test(params.id)) return new Response(null, { status: 404 });
  try {
    const row = await env.RCC_FACEBOOK_DB.prepare('SELECT image_key FROM facebook_posts WHERE active=1 AND facebook_id=?').bind(params.id).first();
    if (!row?.image_key) return new Response(null, { status: 404 });
    const image = await env.RCC_FACEBOOK_MEDIA.get(row.image_key);
    if (!image) return new Response(null, { status: 404 });
    return new Response(image.body, { headers: { 'Content-Type': image.httpMetadata?.contentType || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'no-store' } });
  } catch { return new Response(null, { status: 503 }); }
}
