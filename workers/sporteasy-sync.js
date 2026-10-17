import { syncCalendars } from '../integrations/sporteasy/calendar.js';
export default {
  async scheduled(event, env, ctx) {
    const now = event.scheduledTime || Date.now();
    // Reuse the existing half-hour trigger: the 02:00 UTC slot is the daily full pass.
    const date = new Date(now);
    const mode = date.getUTCHours() === 2 && date.getUTCMinutes() === 0 ? 'full' : 'priority';
    ctx.waitUntil(syncCalendars(env, fetch, now, { mode }).then(result => console.log(JSON.stringify(result))).catch(() => console.error('{"status":"configuration_or_storage_error"}')));
  },
  fetch() { return new Response('Not found', { status: 404 }); }
};
