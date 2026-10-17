import {readdir,readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{resolve,join}from'node:path';
const root=resolve(process.argv[2]);
const changed=new Set(['calendrier.html','calendar-view.js','calendar-model.js']);
const files=(await readdir(root)).filter(name=>/\.(html|js|css|webmanifest)$/.test(name)&&!changed.has(name));
const hash=b=>createHash('sha256').update(b).digest('hex');let index=0;const different=[],checked=[];
// Cloudflare email protection rewrites its opaque key per response; compare
// that public transform semantically, not as a source change.
const canonical=(b,name)=>name==='nous-rejoindre.html'?Buffer.from(b.toString('utf8').replace(/data-cfemail="[a-f0-9]+"|\/cdn-cgi\/l\/email-protection#[a-f0-9]+/gi,'EMAIL_PROTECTION')):b;
await Promise.all(Array.from({length:6},async()=>{while(index<files.length){const name=files[index++];const r=await fetch(`https://rccubzaguais.fr/${name}`,{redirect:'follow'});if(!r.ok)throw Error('public_asset_unavailable');const live=Buffer.from(await r.arrayBuffer()),local=await readFile(join(root,name));checked.push(name);if(hash(live)!==hash(local)){
 if(hash(canonical(live,name))===hash(canonical(local,name)))continue;
 if(process.argv[3]==='--preserve-public'&&name==='nous-rejoindre.html')await writeFile(join(root,name),live);
 else different.push(name);
 }}}));
console.log(JSON.stringify({checked:checked.length,unrelatedDifferences:different}));if(different.length)process.exitCode=1;
