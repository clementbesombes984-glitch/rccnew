import { updateStandings } from '../functions/_lib/standings.js';

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(updateStandings(env)); },
  fetch() { return new Response('Not found', { status: 404 }); }
};
