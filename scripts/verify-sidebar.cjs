// Browser regression: run against the local dev server with Playwright available.
// SIDEBAR_URL and BROWSER_EXECUTABLE optionally select server and browser.
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const artifacts = mkdtempSync(join(tmpdir(), 'sidebar-check-'));
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || undefined,headless:true,args:['--no-sandbox']});
 const page = await browser.newPage({viewport:{width:1440,height:1000}});

 const errors=[]; page.on('pageerror', e=>errors.push(e.message));
 await page.route('**/src/utils/supabaseClient.ts*', route=>route.fulfill({contentType:'application/javascript',body:'export const supabase=null; export const cloudEnabled=false;'}));
 await page.route('**/src/hooks/useCloudSync.ts*', route=>route.fulfill({contentType:'application/javascript',body:`const rows=[{id:'preview-1',patient_name:'Bella',patient_number:'1042',species:'canine',chart_date:'2026-11-16',updated_at:'2026-11-16T12:00:00Z',recall_date:'2026-12-16',user_id:'preview'}]; const noop=async()=>{}; const state={enabled:true,status:'saved',dirty:false,online:true,saveError:'',awaitingClinical:false,lastSavedAt:'2026-11-16T12:00:00Z',listCharts:async()=>({rows,hasMore:false}),listPatientVisits:async()=>rows,openChart:async()=>true,deleteChart:noop,clearRecalls:noop,confirmDiscardIfDirty:async()=>true,fetchChart:async()=>({}),skipDuplicateCheckFor:noop,saveNow:noop,signOut:noop,restoreRevision:noop}; export const useCloudSync=()=>state;`}));
 await page.addInitScript(()=>{

 localStorage.setItem('vibing-dental.auth.v1','1');
 localStorage.setItem('vibing-dental.onboarding.seen.v1','1');
 });
 page.setDefaultTimeout(10000);
 await page.goto((process.env.SIDEBAR_URL || 'http://127.0.0.1:5173')+'/#/chart');
 await page.locator('.sidebar-layout__nav-item').first().waitFor();
 await page.getByRole('button',{name:'Got it',exact:true}).click();

 await page.locator('.sidebar-layout__nav-item').filter({hasText:'Diagnosis'}).click();

 const results=[];
 for(const width of [1440,1000]) {
  await page.setViewportSize({width,height:900});
  const positions=[];
  for(const fraction of [0,0.5,1]) {
   await page.evaluate(f=>window.scrollTo(0,f*(document.documentElement.scrollHeight-innerHeight)),fraction);
   await page.waitForTimeout(150);
   positions.push(await page.locator('.workspace-sidebar').evaluate(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,y:scrollY})));
  }
  if(positions[2].y<100) throw new Error('Fixture must exercise a scrollable diagnosis page');
  if(Math.max(...positions.map(p=>p.top))-Math.min(...positions.map(p=>p.top))>2) throw new Error(`Sidebar moves while scrolling at ${width}px: ${JSON.stringify(positions)}`);
  const main=await page.locator('.workspace-main').boundingBox();
  const rail=await page.locator('.workspace-sidebar').boundingBox();
  if(main.x < rail.x+rail.width) throw new Error('Sidebar overlaps content');
  if(positions.some(p=>p.top<0 || p.bottom>902)) throw new Error('Sidebar leaves viewport');
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByRole('button',{name:/Account settings/}).waitFor({state:'visible'});
  await page.screenshot({path:`${artifacts}/desktop-${width}-bottom-menu.png`});
  await page.keyboard.press('Escape');
  results.push({width,positions});
 }
 for(const width of [390,320]) {
  await page.setViewportSize({width,height:844});
  await page.evaluate(()=>scrollTo(0,0));
  await page.waitForTimeout(150);
  if(await page.locator('.workspace-sidebar').evaluate(e=>getComputedStyle(e).position)==='fixed') throw new Error('Phone navigation must stay in normal flow');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Phone page overflows');
  await page.screenshot({path:`${artifacts}/phone-${width}.png`});
 }
 if(errors.length) throw new Error(errors.join('\n'));
 console.log(JSON.stringify({results,artifacts}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
