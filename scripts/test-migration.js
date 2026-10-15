import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { onRequestPost as sendPush } from '../functions/api/push/send.js';
import { onRequestDelete as unsubscribe } from '../functions/api/push/subscribe.js';
import { onRequestGet as pushConfig } from '../functions/api/push/config.js';
import { onRequestGet as studioInfo, onRequestPost as studioPublish } from '../functions/api/studio/publish.js';

const baseEnv = { PUSH_ADMIN_TOKEN: 'test-token', RCC_SITE_ORIGIN: 'https://rccubzaguais.fr', RCC_PUSH_DELIVERY_MODE: 'workflow' };
const request = (origin, source) => new Request(`${origin}/api/push/send`, { method: 'POST', headers: { Authorization: 'Bearer test-token', ...(source ? { 'X-RCC-Push-Source': source } : {}) }, body: '{}' });
assert.equal((await sendPush({request:request('https://rccnew.pages.dev','github-workflow'),env:{...baseEnv,RCC_PUSH_ENABLED:'true'}})).status,409);
assert.equal((await sendPush({request:request('https://rccubzaguais.fr','github-workflow'),env:baseEnv})).status,409);
assert.equal((await sendPush({request:request('https://rccubzaguais.fr'),env:{...baseEnv,RCC_PUSH_ENABLED:'true'}})).status,409);
let touched = 0;
assert.equal((await unsubscribe({request:new Request('https://rccnew.pages.dev/api/push/subscribe',{method:'DELETE',body:'{}'}),env:{...baseEnv,RCC_PUSH_SUBSCRIPTIONS:{delete(){touched++;}}}})).status,409);
assert.equal(touched,0);
let pages=0;
const guardedKv={list:async({cursor}={})=>{pages++;return cursor?{keys:[{name:'second'}],list_complete:true}:{keys:[{name:'first'}],list_complete:false,cursor:'next'};},get:async()=>JSON.stringify({siteOrigin:'https://unrelated.example',preferences:{actualites:true}}),delete(){throw new Error('Never delete subscriptions during migration');}};
const paginated=await sendPush({request:request('https://rccubzaguais.fr','github-workflow'),env:{...baseEnv,RCC_PUSH_ENABLED:'true',RCC_PUSH_SUBSCRIPTIONS:guardedKv,VAPID_PUBLIC_KEY:'existing-public',VAPID_PRIVATE_KEY:'existing-private'}});
const paginationResult=await paginated.json();assert.equal(paginationResult.total,2);assert.equal(paginationResult.skipped,2);assert.equal(pages,2);
const config = await pushConfig({request:new Request('https://rccnew.pages.dev/api/push/config'),env:{...baseEnv,VAPID_PUBLIC_KEY:'same-public-key'}});
assert.equal(config.headers.get('Cache-Control'),'no-store');
assert.equal((await config.json()).enabled,false);
assert.equal((await (await pushConfig({request:new Request('https://rccubzaguais.fr/api/push/config'),env:{...baseEnv,VAPID_PUBLIC_KEY:'same-public-key'}})).json()).publicKey,'same-public-key');
assert.equal((await (await studioInfo({env:{}})).json()).repository,'clementbesombes984-glitch/rccnew');
await assert.rejects(()=>studioInfo({env:{RCC_GITHUB_REPOSITORY:'clementbesombes984-glitch/rcc2026'}}),/rccnew/);

const originalFetch=globalThis.fetch;
const puts=[];
globalThis.fetch=async (url,options={})=>{
  assert(String(url).startsWith('https://api.github.com/repos/clementbesombes984-glitch/rccnew/contents/'));
  if(options.method==='PUT') {puts.push({url:String(url),payload:JSON.parse(options.body)}); return Response.json({commit:{sha:'test'}});}
  const data=String(url).includes('newsletters.json')?{newsletters:[]}:String(url).includes('compositions.json')?{compositions:[]}:String(url).includes('push-queue.json')?{notifications:[]}:{news:[]};
  return Response.json({sha:'previous',content:Buffer.from(JSON.stringify(data)).toString('base64')});
};
const studioEnv={PAGES_CMS_PASSWORD:'test-password',ADMIN_SESSION_SECRET:'test-session-secret-distinct-32-characters',RCC_GITHUB_TOKEN:'test-github-token'};
async function publish(payload){const response=await studioPublish({request:new Request('https://rccnew.pages.dev/api/studio/publish',{method:'POST',body:JSON.stringify({password:'test-password',...payload})}),env:studioEnv});assert.equal(response.status,200);return response.json();}
try{
  const article=await publish({publishSite:true,publishPush:true,article:{id:'test',title:'Test',date:'2026-10-15'},push:{title:'Test'}});
  assert.equal(article.push.channel,'github-workflow');
  assert.equal(JSON.parse(Buffer.from(puts.at(-1).payload.content,'base64').toString()).news[0].notification,true);
  const composition=await publish({kind:'composition',composition:{id:'test',title:'Équipe',players:[{number:1,name:'Test'}]}});
  assert.equal(composition.composition.players.length,1);
  const newsletter=await publish({kind:'newsletter',newsletter:{id:'journal-test',title:'Journal',pdfData:'data:application/pdf;base64,dGVzdA==',coverData:'data:image/png;base64,dGVzdA=='}});
  assert.equal(newsletter.newsletter.id,'journal-test');
  const queued=await publish({publishPush:true,push:{title:'Composition',url:'/admin/generateur-affiche.html#composition'}});
  assert.equal(queued.push.channel,'github-workflow');
  assert(puts.at(-1).url.endsWith('data/push-queue.json'));
}finally{globalThis.fetch=originalFetch;}

const handlers={}; let cacheCalls=0; let lastFetch;
const context={URL,Request,Response,console,self:{location:{origin:'https://rccubzaguais.fr'},addEventListener:(type,handler)=>{handlers[type]=handler;}},fetch:async(req,options)=>{lastFetch={req,options};return new Response('{}');},caches:{open(){cacheCalls++;throw new Error('API must not use CacheStorage');}}};
vm.runInNewContext(fs.readFileSync('sw.js','utf8'),context);
for(const path of ['/api/standings','/api/push/config','/api/studio/publish','/admin/generateur-affiche.html','/cms-login']){
  let result;
  handlers.fetch({request:new Request('https://rccubzaguais.fr'+path),respondWith(p){result=p;}});
  assert.equal((await result).status,200);
  assert.equal(lastFetch.req.cache,'no-store');
}
assert.equal(cacheCalls,0);
const removed=[];
context.caches={keys:async()=>['rcc-pwa-v2-6-standings-static','another-app-cache'],delete:async(key)=>removed.push(key)};
context.self.clients={claim:async()=>{}};
let activation;handlers.activate({waitUntil(p){activation=p;}});await activation;
assert.deepEqual(removed,['rcc-pwa-v2-6-standings-static']);
assert.deepEqual(JSON.parse(fs.readFileSync('manifest.webmanifest','utf8')),JSON.parse(execFileSync('git',['show','HEAD:manifest.webmanifest'],{encoding:'utf8'})));
console.log('Migration : garde-fous push, canal unique, Studio rccnew, newsletter/composition, API sans cache, activation PWA et manifeste inchangé : OK. Aucun appel distant ni abonnement modifié.');
