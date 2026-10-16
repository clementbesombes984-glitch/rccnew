import { syncFacebook, ImportError } from '../integrations/meta/facebook-import.js';
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(syncFacebook(env).then((result) => console.log(JSON.stringify(result))).catch((error) => {
      console.error(JSON.stringify({ status: 'error', code: error instanceof ImportError ? error.code : 'storage_or_internal',
        ...(error instanceof ImportError ? { diagnostics: error.diagnostics } : {}) }));
    }));
  },
  fetch() { return new Response('Not found', { status: 404 }); }
};
