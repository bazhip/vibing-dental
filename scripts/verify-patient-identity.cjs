// Local browser regression. Requires Playwright and a running Vite dev server.
// NODE_PATH may point to an existing Playwright install; no production calls.
const { chromium } = require('playwright');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const artifacts = mkdtempSync(join(tmpdir(), 'patient-identity-'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-features=LocalNetworkAccessChecks']});
 const page=await browser.newPage();
 const errors=[]; page.on('pageerror', e=>{errors.push(e.message);console.error(e.message);});
 page.on('console', m=>{if(m.type()==='error')console.error(m.text());});
 page.setDefaultTimeout(10000);
 await page.route('**/src/utils/supabaseClient.ts*',route=>route.fulfill({contentType:'application/javascript',body:`
 export const cloudEnabled=true;
 window.savedIdentity={patient_name:'Luffy',patient_number:'SP0001'};
 window.writes=[];
 export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'fixture'}}}})},from:()=>{
  let cols='',row; const q={select:c=>(cols=c,q),eq:()=>q,order:()=>q,limit:()=>q,ilike:()=>q,
   upsert:r=>(row=r,q),maybeSingle:async()=>{
    if(row){window.writes.push(row);window.savedIdentity={patient_name:row.patient_name,patient_number:row.patient_number};return {data:{updated_at:'2026-11-16T12:00:00Z'},error:null};}
    return {data:cols==='patient_name, patient_number'?window.savedIdentity:{updated_at:'2026-11-16T12:00:00Z'},error:null};
   },then:resolve=>resolve({data:[],error:null})};return q;
 }};`}));
 // Never allow a real backend request from the fixture.
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.route('**/__identity-check',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true; await import("/scripts/fixtures/patient-identity-preview.jsx");</script>'}));
 const url=(process.env.IDENTITY_URL || 'http://127.0.0.1:5175')+'/__identity-check';
 const dialog=page.getByRole('alertdialog');
 const open=async()=>{
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await dialog.waitFor();
  await dialog.evaluate(e=>Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished)));
 };
 const checkNoWrites=async()=>{if((await page.evaluate(()=>window.writes)).length)throw new Error('Unexpected write: '+JSON.stringify(await page.evaluate(()=>window.writes.map(r=>({name:r.patient_name,number:r.patient_number})))));};
 await page.goto(url);
 await page.getByRole('textbox',{name:'Patient name',exact:true}).fill('Novmi');
 await page.getByRole('textbox',{name:'Patient number',exact:true}).fill('SP9111');
 await dialog.waitFor();
 await checkNoWrites();
 if(await page.locator(':focus').textContent()!=='Cancel')throw new Error('Cancel must receive initial focus');
 await page.keyboard.press('Shift+Tab');
 if(await page.locator(':focus').textContent()!=='Confirm correction')throw new Error('Focus escaped dialog');
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'hidden'});
 await checkNoWrites();
 await open();
 await page.mouse.click(2,2);
 await dialog.waitFor({state:'hidden'});
 await checkNoWrites();
 await open();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await checkNoWrites();
 const cases=[];
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  for(const long of [false,true]){
   await page.getByRole('textbox',{name:'Patient name',exact:true}).fill(long?'Lady Penelope Alexandra Montgomery of Westbridge Veterinary Centre':'Novmi');
   await page.getByRole('textbox',{name:'Patient number',exact:true}).fill(long?'SP9111-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ':'SP9111');
   await open();
   const bounds=await dialog.boundingBox();
   if(bounds.x<0 || bounds.x+bounds.width>width || bounds.y<0 || bounds.y+bounds.height>900)throw new Error('Dialog outside viewport');
   if(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth))throw new Error('Dialog overflows');
   const buttons=await dialog.getByRole('button').all();
   for(const button of buttons){if(width<600 && (await button.boundingBox()).height<44)throw new Error('Short mobile touch target: '+JSON.stringify(await button.boundingBox()));}
   await page.screenshot({path:join(artifacts,width+(long?'-long':'')+'.png')});
   cases.push({width,long});
   await page.keyboard.press('Escape');
  }
 }
 await page.evaluate(async()=>{await window.setLanguage('de');});
 await open();
 await page.screenshot({path:join(artifacts,'320-german.png')});
 await page.keyboard.press('Escape');
 await page.evaluate(async()=>{await window.setLanguage('en');document.documentElement.dataset.theme='dark';});
 await open();
 await page.screenshot({path:join(artifacts,'320-dark.png')});
 await page.getByRole('button',{name:'Confirm correction',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(()=>window.writes.length===1);
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({cases,artifacts,writes:await page.evaluate(()=>window.writes.length)}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
