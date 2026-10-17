// Local rendered release with REAL Production API data, no private feed access.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RCC_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(process.argv[2]);
(async()=>{
 const payload=await fs.readFile('dist/sporteasy-production-install/calendar-october.json');
 const backup=JSON.parse(await fs.readFile('dist/sporteasy-production-install/before.json'));
 for(const name of ['matches','news'])assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,`data/${name}.json`))),backup.publicData[name]);
 const server=http.createServer(async(req,res)=>{try{
  if(req.url.startsWith('/api/sporteasy-calendar')){res.setHeader('Content-Type','application/json');res.end(payload);return;}
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();
  const data=await fs.readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.RCC_BROWSER_PATH});
 try{for(const [kind,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.name));
  const live=process.env.RCC_TEST_LIVE==='true';let forbiddenPush=0;
  await page.route('**/*',r=>{if(r.request().method()==='POST'&&/\/api\/push\//.test(r.request().url())){forbiddenPush++;return r.abort();}return live||r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort();});
  const loaded=page.waitForResponse(r=>r.url().includes('/api/sporteasy-calendar?')&&r.status()===200);
  await page.goto(live?'https://rccubzaguais.fr/calendrier.html':`http://127.0.0.1:${server.address().port}/calendrier.html`);await loaded;await page.waitForSelector('[data-category="M6"]');
  assert.equal(await page.locator('[data-category]').count(),10);
  for(const category of ['M6','M8','M10','M12','M14','M16','M19','Cadettes','Seniors']){
   await page.locator(`[data-category="${category}"]`).click();assert.equal(await page.locator(`[data-category="${category}"]`).getAttribute('aria-pressed'),'true');
  }
  await page.locator('[data-category="all"]').click();
  for(const type of ['match','training','other']){await page.locator(`[data-event-type="${type}"]`).click();assert.equal(await page.locator(`[data-event-type="${type}"]`).getAttribute('aria-pressed'),'true');}
  await page.locator('[data-event-type="all"]').click();
  const old=await page.locator('[data-calendar-month-title]').textContent();await page.locator('[data-calendar-next]').click();assert.notEqual(await page.locator('[data-calendar-month-title]').textContent(),old);await page.locator('[data-calendar-prev]').click();
  assert.deepEqual(errors,[]);assert.equal(forbiddenPush,0);await page.screenshot({path:`dist/sporteasy-production-install/${live?'official-':''}${kind}.png`,fullPage:true});console.log(JSON.stringify({viewport:kind,categoryFilters:9,typeFilters:true,monthNavigation:true,errors:0,pushPosts:forbiddenPush,renderedData:live?'official_site':'real_production_snapshot_local_server'}));await page.close();
 }}finally{await browser.close();server.close();}
})().catch(()=>{console.error('browser_validation_failed');process.exitCode=1;});
