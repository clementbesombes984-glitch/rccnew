import { syncFacebook, ImportError } from '../integrations/meta/facebook-import.js';
export default {
  async scheduled(_event, env, ctx) {
    const started = Date.now();
    ctx.waitUntil(syncFacebook(env).then((result) => console.log(JSON.stringify({ ...result, durationMs: Date.now() - started }))).catch((error) => {
      console.error(JSON.stringify({ status: 'error', code: error instanceof ImportError ? error.code : 'storage_or_internal',
        ...(error instanceof ImportError ? { diagnostics: error.diagnostics, ...error.stats } : {}),
        durationMs: Date.now() - started }));
    }));
  },
  fetch() { return new Response('Not found', { status: 404 }); }
};
