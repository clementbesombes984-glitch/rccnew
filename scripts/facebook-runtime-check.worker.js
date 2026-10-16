import { graph, PAGE_ID } from '../integrations/meta/facebook-import.js';
// Do not deploy. Uses only simulated responses: zero outbound fetch calls.
export default {
  async fetch() {
    const checks = {};
    try {
      new Request('https://example.invalid/', { redirect: 'error' });
      checks.oldModeRejected = false;
    } catch (error) { checks.oldModeRejected = error.name === 'TypeError'; }
    let constructions = 0;
    const data = await graph(`${PAGE_ID}/posts`, 'not-a-real-token', {}, async (url, init) => {
      const request = new Request(url, init); // Actual workerd validation, not Node's implementation.
      if (request.redirect !== 'manual') throw new Error('Unexpected mode');
      constructions++;
      return Response.json({ data: [] });
    });
    checks.correctedRequestAccepted = constructions === 1 && Array.isArray(data.data);
    try {
      await graph(`${PAGE_ID}/posts`, 'not-a-real-token', {}, async () => new Response(null, { status: 302, headers: { Location: 'https://example.invalid/' } }));
      checks.redirectBlocked = false;
    } catch (error) { checks.redirectBlocked = error.code === 'meta_redirect' && error.diagnostics.httpStatus === 302; }
    checks.timeoutSupported = typeof AbortSignal.timeout === 'function';
    return Response.json({ passed: Object.values(checks).every(Boolean), checks });
  }
};
