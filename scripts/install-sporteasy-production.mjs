// Controlled Production bootstrap: real feeds, one category at a time, no Preview reads.
// Never prints credentials, feed URLs, ICS, titles or header values.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {CATEGORIES,syncCalendars} from '../integrations/sporteasy/calendar.js';
import {onRequestGet} from '../functions/api/sporteasy-calendar.js';
const mode=process.argv[2];
const directory=resolve('dist/sporteasy-production-install');
const namespace='2f273875520b4362af2f4323aec5ec5b';
const base='https://api.cloudflare.com/client/v4/accounts/4299612fac6e91fbee26ed07aa7baa3f';
let credential;
const auth=await readFile('C:/Users/Clement/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8');
credential=auth.match(/^oauth_token\s*=\s*["']([^"']+)/m)?.[1];
async function cf(path,init={}){
 const response=await fetch(base+path,{...init,headers:{...init.headers,Authorization:`Bearer ${credential}`}});
 if(!response.ok)throw Error(`cloudflare_http_${response.status}`);
 return response;
}
const kv={
 async get(key){const response=await fetch(`${base}/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${credential}`}});if(response.status===404)return null;if(!response.ok)throw Error('storage_read');return response.json();},
 async put(key,value){if(!/^calendar:(M6|M8|M10|M12|M14|M16|M19|Cadettes|Seniors)$/.test(key))throw Error('invalid_target');await cf(`/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(key)}`,{method:'PUT',body:value});}
};
try{
 await mkdir(directory,{recursive:true});
 if(mode==='backup'){
  const path=`${directory}/before.json`;
  try{await readFile(path);throw Error('backup_already_exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  const keys=await (await cf(`/storage/kv/namespaces/${namespace}/keys?limit=1000`)).json();
  if(keys.result_info?.cursor)throw Error('backup_pagination_required');
  const snapshots={};for(const key of keys.result){snapshots[key.name]=await (await cf(`/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(key.name)}`)).text();}
  const publicData={};for(const name of ['matches','news']){const r=await fetch(`https://rccubzaguais.fr/data/${name}.json`);if(!r.ok)throw Error('manual_backup');publicData[name]=await r.json();}
  await writeFile(path,JSON.stringify({createdAt:new Date().toISOString(),namespace,snapshots,publicData},null,2),{flag:'wx'});
  console.log(JSON.stringify({backup:true,keys:Object.keys(snapshots).length,matches:publicData.matches.matches.length,news:publicData.news.news.length}));
 }else if(mode==='seed'){
  const backup=JSON.parse(await readFile(`${directory}/before.json`,'utf8'));if(backup.namespace!==namespace)throw Error('backup_missing');
  const feeds=await readFile('C:/Users/Clement/AppData/Local/Temp/rcc-sporteasy-private/feeds.json','utf8');
  for(const category of CATEGORIES){
   const result=await syncCalendars({RCC_SPORTEASY_KV:kv,RCC_SPORTEASY_SYNC_ENABLED:'true',RCC_SPORTEASY_FEEDS:feeds},fetch,Date.now(),{category,mode:'full'});
   console.log(JSON.stringify({category,execution:'controlled_node_not_cloudflare_cpu',...result}));
   if(result.status!=='ok')throw Error('category_initialization_failed');
   const snapshot=await kv.get(`calendar:${category}`);
   if(!snapshot||snapshot.events.length!==result.results[0].events)throw Error('readback_failed');
  }
  const counts=[],ids=[];for(const category of CATEGORIES){const s=await kv.get(`calendar:${category}`);counts.push({category,events:s.events.length});ids.push(...s.events.map(e=>e.id));}
  const report={at:new Date().toISOString(),counts,total:ids.length,unique:new Set(ids).size};
  await writeFile(`${directory}/initialization.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }else if(mode==='verify'){
  const backup=JSON.parse(await readFile(`${directory}/before.json`,'utf8'));
  for(const name of ['matches','news']){
   const actual=await (await fetch(`https://rccubzaguais.fr/data/${name}.json`)).json();
   if(JSON.stringify(actual)!==JSON.stringify(backup.publicData[name]))throw Error('manual_data_changed');
  }
  const counts=[],ids=[];
  for(const category of CATEGORIES){const snapshot=await kv.get(`calendar:${category}`);if(!snapshot?.events?.length)throw Error('category_missing');counts.push({category,events:snapshot.events.length});for(const event of snapshot.events){if(!event.categories.includes(category)||!Number.isFinite(Date.parse(event.start))||!Number.isFinite(Date.parse(event.end)))throw Error('invalid_event');ids.push(event.id);}}
  if(new Set(ids).size!==ids.length)throw Error('duplicate_events');
  for(const month of ['2026-08','2026-10','2026-12']){
   const response=await onRequestGet({env:{RCC_SPORTEASY_READ_ENABLED:'true',RCC_SPORTEASY_KV:kv},request:new Request(`https://rccubzaguais.fr/api/sporteasy-calendar?month=${month}`)});
   const payload=await response.json();if(payload.sources.length!==9||payload.sources.some(s=>!s.available))throw Error('api_sources');
   if(month==='2026-10')await writeFile(`${directory}/calendar-october.json`,JSON.stringify(payload));
   console.log(JSON.stringify({month,events:payload.events.length,sources:payload.sources.length,types:[...new Set(payload.events.map(e=>e.type))]}));
  }
  console.log(JSON.stringify({verified:true,total:ids.length,unique:new Set(ids).size,counts,manualDataExact:true}));
 }else throw Error('invalid_mode');
}catch(error){console.error(JSON.stringify({status:'blocked',code:/^[a-z_0-9]+$/.test(error.message)?error.message:'installation_error'}));process.exitCode=1;}finally{credential=null;}
