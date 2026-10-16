import { syncCalendars } from '../integrations/sporteasy/calendar.js';
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(syncCalendars(env).then(result => console.log(JSON.stringify(result))).catch(() => console.error('{"status":"configuration_or_storage_error"}')));
  },
  fetch() { return new Response('Not found', { status: 404 }); }
};
