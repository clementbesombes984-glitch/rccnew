export async function onRequestGet({ env, request }) {
  return Response.json({
    publicKey: env.VAPID_PUBLIC_KEY || '',
    enabled: Boolean(env.VAPID_PUBLIC_KEY) && new URL(request.url).origin === env.RCC_SITE_ORIGIN,
    siteOrigin: env.RCC_SITE_ORIGIN || ''
  }, { headers: { 'Cache-Control': 'no-store' } });
}
