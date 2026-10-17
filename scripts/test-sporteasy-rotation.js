import assert from 'node:assert/strict';
import { ROTATION_CATEGORIES, sportEasySlot } from '../integrations/sporteasy/rotation.js';
import { syncCalendars } from '../integrations/sporteasy/calendar.js';
import { SportEasyCoordinator } from '../integrations/sporteasy/coordinator.js';
const midnight = Date.parse('2026-10-17T00:00:00Z');
const step = 600000;
assert.deepEqual(Array.from({length:9}, (_,i)=>sportEasySlot(midnight+i*step).category),ROTATION_CATEGORIES);
assert.equal(sportEasySlot(midnight+9*step).category,'M6');
assert.equal(sportEasySlot(midnight+2*step).category,'M10','Missed M8 slot does not shift subsequent work');
for (const day of ['2026-03-29','2026-10-25','2026-10-17']) {
  const start=Date.parse(`${day}T00:00:00Z`);
  const counts=new Map(), full=new Map();
  for(let i=0;i<144;i++) {
    const scheduled=start+i*step;
    const a=sportEasySlot(scheduled), restarted=sportEasySlot(scheduled);
    assert.deepEqual(a,restarted);
    assert.equal(sportEasySlot(scheduled+9*step).category,a.category);
    assert.equal(sportEasySlot(scheduled+599999).category,a.category);
    counts.set(a.category,(counts.get(a.category)||0)+1);
    if(a.dailyFullSlot)full.set(a.category,(full.get(a.category)||0)+1);
  }
  assert.equal(counts.size,9);assert([...counts.values()].every(n=>n===16));
  assert.equal(full.size,9);assert([...full.values()].every(n=>n===1));
}
for(const invalid of [-1,NaN,Infinity,0.1])assert.throws(()=>sportEasySlot(invalid));
// Only the selected category is fetched/read/written; the other eight keys survive.
const store=new Map(ROTATION_CATEGORIES.map(category=>[`calendar:${category}`,JSON.stringify({events:[],sentinel:category})]));
const reads=[], writes=[], downloads=[];
const kv={async get(key){reads.push(key);return store.has(key)?JSON.parse(store.get(key)):null;},async put(key,value){writes.push(key);store.set(key,value);}};
const feeds=Object.fromEntries(ROTATION_CATEGORIES.map((category,i)=>[category,`https://calendar.sporteasy.net/icalendars/team/${i+1}/${'a'.repeat(32)}.ics`]));
const env={RCC_SPORTEASY_KV:kv,RCC_SPORTEASY_SYNC_ENABLED:'true',RCC_SPORTEASY_FEEDS:JSON.stringify(feeds)};
const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:fixture\r\nDTSTART:20261018T100000Z\r\nDTEND:20261018T110000Z\r\nSUMMARY:Match RCC\r\nEND:VEVENT\r\nEND:VCALENDAR';
const before=new Map(store);
const result=await syncCalendars(env,async url=>{downloads.push(url);return new Response(ics);},midnight,{category:'M6',mode:'full'});
assert.equal(result.status,'ok');assert.equal(downloads.length,1);assert(downloads[0].includes('/team/1/'));
assert(reads.every(key=>key.endsWith(':M6')));assert(writes.every(key=>key.endsWith(':M6')));
for(const category of ROTATION_CATEGORIES.slice(1))assert.equal(store.get(`calendar:${category}`),before.get(`calendar:${category}`));
await assert.rejects(()=>syncCalendars(env,()=>{throw Error('must not fetch');},midnight,{category:'unknown',mode:'full'}));
// Simulated Durable Object gates: concurrent duplicate slots run once; persistence
// survives a fresh class instance and daily full work catches up after a missed slot.
const durableStore=new Map();let gate=Promise.resolve();let calls=0;let active=0;let maxActive=0;const modes=[];
const state={storage:{async get(key){return durableStore.get(key);},async put(key,value){durableStore.set(key,value);}},
  blockConcurrencyWhile(callback){const task=gate.then(callback);gate=task.catch(()=>{});return task;}};
const sync=async (_env,_fetch,_time,options)=>{calls++;modes.push(options.mode);active++;maxActive=Math.max(maxActive,active);await new Promise(setImmediate);active--;return {status:'ok',results:[{category:options.category,events:1}]};};
const request=time=>new Request('https://internal/sync',{method:'POST',body:JSON.stringify({scheduledTime:time})});
const originalLog=console.log;console.log=()=>{};
try {
  const coordinator=new SportEasyCoordinator(state,env,sync);
  const pair=await Promise.all([coordinator.fetch(request(midnight)),coordinator.fetch(request(midnight))]);
  assert.equal(calls,1);assert.equal(maxActive,1);
  assert.equal((await pair[1].json()).status,'duplicate_or_old');
  const restarted=new SportEasyCoordinator(state,env,sync);
  assert.equal((await (await restarted.fetch(request(midnight))).json()).status,'duplicate_or_old');
  await restarted.fetch(request(midnight+9*step));
  await restarted.fetch(request(midnight+86400000+9*step)); // Missed next midnight, still full.
  assert.deepEqual(modes,['full','priority','full']);
  assert.equal((await (await restarted.fetch(request(midnight+step))).json()).status,'category_mismatch');
  assert.equal((await restarted.fetch(request(-1))).status,400);
} finally {console.log=originalLog;}
console.log('Rotation UTC: neuf catégories, 90 minutes, équité, créneaux manqués, redémarrage et DST simulés : OK. Aucun accès Cloudflare.');
