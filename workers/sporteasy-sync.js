import { sportEasySlot } from '../integrations/sporteasy/rotation.js';
export { SportEasyCoordinator } from '../integrations/sporteasy/coordinator.js';
export default {
  async scheduled(event, env, ctx) {
    if (env.RCC_SPORTEASY_SYNC_ENABLED !== 'true') { console.log('{"status":"disabled"}'); return; }
    const now = event.scheduledTime;
    const {category, slot} = sportEasySlot(now);
    ctx.waitUntil((async () => {
      try {
        const id = env.RCC_SPORTEASY_COORDINATOR.idFromName(category);
        const response = await env.RCC_SPORTEASY_COORDINATOR.get(id).fetch('https://sporteasy.internal/sync', {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({scheduledTime:now})
        });
        const result = await response.json();
        console.log(JSON.stringify({component:'cron-dispatch',category,slot,status:result.status,mode:result.mode}));
      } catch { console.error(JSON.stringify({component:'cron-dispatch',status:'coordination_error',category,slot})); }
    })());
  },
  fetch() { return new Response('Not found', { status: 404 }); }
};
