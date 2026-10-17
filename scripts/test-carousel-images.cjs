const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.RCC_PLAYWRIGHT_PATH||'playwright');
const base=process.argv[2]||'https://codex-carousel-images.rccnew.pages.dev';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.RCC_BROWSER_PATH});
 try{
  for(const [kind,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'});
   const page=await context.newPage();const errors=[];let metaCalls=0,pushCalls=0;
   page.on('pageerror',e=>errors.push(e.name));
   await page.route('**/*',route=>{const r=route.request();if(r.url().includes('graph.facebook.com')){metaCalls++;return route.abort();}
    if(r.method()==='POST'&&r.url().includes('/api/push/')){pushCalls++;return route.abort();}return route.continue();});
   const api=page.waitForResponse(r=>r.url().includes('/api/facebook-news?limit=20')&&r.ok());
   await page.goto(base);const payload=await (await api).json();
   const post=payload.news.find(x=>x.id==='facebook-1131153776758221_122129574831400436');assert(post?.image);
   await page.waitForSelector('[data-cinematic-hero][data-news-managed="true"]');
   await page.locator('[data-co-hero-content]').hover();
   const dots=page.locator('[data-co-hero-dots] button');assert.equal(await dots.count(),3);
   let found=false;for(let i=0;i<3;i++){
    await dots.nth(i).click();
    await page.waitForFunction(index=>document.querySelectorAll('[data-co-hero-dots] button')[index]?.getAttribute('aria-current')==='true',i);
    if((await page.locator('[data-co-hero-story]').getAttribute('href')).includes(post.id)){found=true;break;}
   }assert(found);
   await page.waitForFunction(expected=>{const img=document.querySelector('[data-cinematic-slide].is-active');return img?.src===expected&&img.complete&&img.naturalWidth>0;},post.image);
   assert.match(await page.locator('[data-co-hero-title]').textContent(),/CHAMPIONNAT R3/i);
   assert.equal(await page.locator('[data-cinematic-slide].is-active').evaluate(img=>getComputedStyle(img).objectFit),'cover');
   await page.screenshot({path:`dist/carousel-images-${kind}.png`,fullPage:false});
   // More than one cinematic tick must not replace the selected article photo.
   await page.waitForTimeout(8200);
   assert.equal(await page.locator('[data-cinematic-slide].is-active').getAttribute('src'),post.image);
   assert.deepEqual(errors,[]);assert.equal(metaCalls,0);assert.equal(pushCalls,0);
   console.log(JSON.stringify({viewport:kind,apiImageMatchesCarousel:true,championshipPosterLoaded:true,objectFitPreserved:true,independentRotationStopped:true,metaCalls,pushCalls,javascriptErrors:0}));
   await context.close();
  }
  const context=await browser.newContext({reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();let signature='one',broken=false;
  const fixtureId='facebook-1131153776758221_999';
  await page.route('**/data/news.json*',r=>r.fulfill({json:{news:[
   {id:'manual',date:'2026-10-16',title:'Manual own photo',image:'./assets/uploads/FB_IMG_1784493770215.jpg'},
   {id:'missing',date:'2026-10-15',title:'Missing photo',image:''}
  ]}}));
  await page.route('**/api/facebook-news*',r=>r.fulfill({json:{news:[{id:fixtureId,source:'facebook',title:'Facebook fixture',date:'2026-10-17T09:00:38Z',image:`https://scontent.fbcdn.net/test.jpg?signature=${signature}`}],next:null}}));
  const pixel=await fs.readFile('assets/uploads/img21739872392103.jpg');
  await page.route('https://scontent.fbcdn.net/**',r=>broken?r.abort():r.fulfill({body:pixel,contentType:'image/jpeg'}));
  await page.goto(base);
  const current=()=>page.locator('[data-cinematic-slide].is-active');
  await page.waitForFunction(()=>document.querySelector('[data-cinematic-slide].is-active')?.src.includes('signature=one'));
  signature='two';await page.evaluate(()=>{const e=new Event('pageshow');Object.defineProperty(e,'persisted',{value:true});window.dispatchEvent(e);});
  await page.waitForFunction(()=>document.querySelector('[data-cinematic-slide].is-active')?.src.includes('signature=two'));
  await page.locator('[data-co-hero-dots] button').nth(1).click();
  await page.waitForFunction(()=>document.querySelector('[data-co-hero-title]')?.textContent==='Manual own photo');
  await page.waitForFunction(()=>document.querySelector('[data-cinematic-slide].is-active')?.src.endsWith('/assets/uploads/FB_IMG_1784493770215.jpg'));
  await page.locator('[data-co-hero-dots] button').nth(2).click();
  await page.waitForFunction(()=>document.querySelector('[data-co-hero-title]')?.textContent==='Missing photo');
  await page.waitForFunction(()=>document.querySelector('[data-cinematic-slide].is-active')?.complete);
  broken=true;signature='broken';await page.evaluate(()=>{const e=new Event('pageshow');Object.defineProperty(e,'persisted',{value:true});window.dispatchEvent(e);});
  await page.locator('[data-co-hero-dots] button').nth(0).click();
  await page.waitForFunction(()=>document.querySelector('[data-cinematic-slide].is-active')?.src.endsWith('/assets/uploads/img21739872392103.jpg'));
  console.log(JSON.stringify({simulated:true,renewedSignature:true,manualPhoto:true,missingPhotoFallback:true,inaccessiblePhotoFallback:true}));
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(JSON.stringify({status:'failed',name:e.name,message:String(e.message).split('\n')[0].replace(/https?:\/\/\S+/g,'[URL]')}));process.exitCode=1;});
