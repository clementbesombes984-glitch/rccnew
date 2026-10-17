import { syncCalendars } from './calendar.js';
import { sportEasySlot } from './rotation.js';

// One SQLite-backed Durable Object per category; calendar data stays in the existing KV.
export class SportEasyCoordinator {
  constructor(ctx, env, sync = syncCalendars) {
    this.ctx = ctx;
    this.env = env;
    this.sync = sync;
  }
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Not found', {status:404});
    let scheduledTime, selection;
    try {
      ({scheduledTime} = await request.json());
      selection = sportEasySlot(scheduledTime);
    } catch { return Response.json({status:'invalid_slot'}, {status:400}); }
    // Serialization covers all awaits, including network and KV writes. Cloudflare
    // resets a block exceeding 30s; failed requests never advance the checkpoint.
    return this.ctx.blockConcurrencyWhile(async () => {
      const {slot, category, day} = selection;
      const started = Date.now();
      try {
        let mark = Date.now();
        const checkpoint = await this.ctx.storage.get('checkpoint');
        const coordination = {checkpointReadWallMs:Date.now()-mark};
        if (checkpoint && checkpoint.category !== category) return Response.json({status:'category_mismatch'}, {status:409});
        if (checkpoint && slot <= checkpoint.lastSlot) return Response.json({status:'duplicate_or_old', category, slot});
        // First successful visit each UTC day performs a full pass. A missed daily
        // slot is caught up on the next visit, without a second Cron or extra fetch.
        const mode = checkpoint?.lastFullDay === day ? 'priority' : 'full';
        const result = await this.sync(this.env, fetch, scheduledTime, {category, mode});
        mark = Date.now();
        if (result.status === 'ok') await this.ctx.storage.put('checkpoint', {
          category, lastSlot:slot, lastFullDay:mode === 'full' ? day : checkpoint.lastFullDay
        });
        coordination.checkpointWriteWallMs = Date.now()-mark;
        const summary = {component:'category-sync', category, slot, mode, ...result, coordination, durationMs:Date.now()-started};
        console.log(JSON.stringify(summary));
        return Response.json(summary);
      } catch {
        const summary = {component:'category-sync', status:'coordination_or_storage_error', category, slot, durationMs:Date.now()-started};
        console.error(JSON.stringify(summary));
        return Response.json(summary, {status:503});
      }
    });
  }
}
