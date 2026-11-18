// Run against Vite on5188; no live backend/account required.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.PATIENT_PREVIEW_URL||'http://127.0.0.1:5188';
const out=process.env.PATIENT_SCREENSHOTS||'/tmp/patient-directory-review';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const p=await b.newPage();const errors=[],coverage=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/src/hooks/useTeam.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export const useTeam=()=>({members:[{userId:"u1",doctorName:"Dr Ames",email:"ames@test"},{userId:"u2",doctorName:"Dr Jones",email:"jones@test"}],loaded:true});export const call=async()=>({});'}));
 await p.route('**/src/hooks/useChartHistory.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export const useChartHistory=()=>({revisions:[],error:"",loadData:async()=>({})});'}));
 for(const theme of ['light','dark'])for(const width of[1280,1024,390,320])for(const empty of[false,true]){
  await p.setViewportSize({width,height:1000});await p.goto(`${base}/scripts/fixtures/patient-directory-preview.html?theme=${theme}${empty?'&empty=1':''}`);
  const modal=p.getByRole('dialog',{name:'Patients',exact:true});await modal.waitFor();
  if(!empty)await p.getByTitle('2 visits — expand').waitFor();else await p.getByText('No saved charts yet — they save automatically as you chart.').waitFor();
  const toolbar=p.locator('.chart-library__controls'),footer=p.locator('footer');
  assert.equal(await toolbar.getByRole('button',{name:'Import chart PDF',exact:true}).count(),0);
  const importBox=await footer.getByRole('button',{name:'Import chart PDF',exact:true}).boundingBox();assert.ok(importBox.height>=44&&importBox.y+importBox.height<=1000,'footer import must remain reachable');
  const controls=await toolbar.locator('input[type=search],select,button').all();const boxes=await Promise.all(controls.map(c=>c.boundingBox()));
  assert.ok(boxes.every(r=>r.height>=44));if(width>=1024)assert.ok(Math.max(...boxes.map(r=>r.y))-Math.min(...boxes.map(r=>r.y))<2,'desktop controls must align');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width<700&&!empty)for(const action of await p.locator('.chart-library__row-actions > button:visible, .chart-library__row-actions summary:visible').all()){const r=await action.boundingBox();assert.ok(r.height>=44,'phone row actions must have44px targets');}
  const key=`${theme}-${width}-${empty?'empty':'populated'}`;await p.screenshot({path:`${out}/${key}.png`});coverage.push(key);
  if(!empty){
   await p.getByTitle('2 visits — expand').click();await p.locator('.chart-library__visit').first().waitFor();assert.equal(await p.locator('.chart-library__visit').count(),2);
   await p.locator('.chart-library__visit').first().locator('summary').click();await p.screenshot({path:`${out}/${key}-visits-menu.png`});
   await p.locator('.chart-library__visit').first().locator('.chart-library__history').click();await p.getByRole('dialog',{name:'Chart history',exact:true}).waitFor();
   assert.equal(await p.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('[role=dialog]')?.getAttribute('aria-label')),'Chart history');
   await p.screenshot({path:`${out}/${key}-history.png`});await p.keyboard.press('Escape');assert.equal(await p.getByRole('dialog',{name:'Chart history',exact:true}).count(),0);assert.ok(await modal.isVisible());assert.ok(await p.locator('.chart-library__visit').first().locator('summary').evaluate(el=>el===document.activeElement),'history must restore focus to its action disclosure');
   for(const term of['Jordan Ellis','555-0101','jordan@clinic.test']){await p.getByRole('searchbox').fill(term);await p.waitForFunction(t=>window.lastDirectoryQuery?.search===t,term);await p.waitForFunction(()=>document.querySelectorAll('.chart-library__group-main').length===1);assert.ok(await p.getByTitle('Open latest visit for Professor Bartholomew Thistlewhisker the Third').isVisible());}
  }
 }
 // Reversed portal order must not hide the child history dialog.
 await p.goto(`${base}/scripts/fixtures/patient-directory-preview.html?history-first=1`);await p.getByRole('dialog',{name:'Chart history',exact:true}).waitFor();await p.getByRole('dialog',{name:'Patients',exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('[role=dialog]')?.getAttribute('aria-label')),'Chart history');
 const style=el=>{const s=getComputedStyle(el);return[s.backgroundColor,s.borderColor,s.color,s.outline,s.filter,s.boxShadow].join('|');};
 for(const theme of['light','dark']){
  await p.setViewportSize({width:1280,height:1000});await p.goto(`${base}/scripts/fixtures/patient-directory-preview.html?theme=${theme}`);await p.getByRole('dialog',{name:'Patients',exact:true}).waitFor();
  for(const selector of['.chart-library__new-visit','.chart-library__filter--primary','footer .chart-library__filter']){const el=p.locator(selector).first();await p.mouse.move(1,1);await p.waitForTimeout(160);const before=await el.evaluate(style);await el.hover();await p.waitForTimeout(160);assert.notEqual(await el.evaluate(style),before,`no hover feedback: ${selector}`);}
  await p.screenshot({path:`${out}/${theme}-toolbar-hover.png`});await p.getByRole('dialog',{name:'Patients',exact:true}).getByRole('button',{name:'Close',exact:true}).click();
  for(const selector of['.voice-input:not(:disabled)','.workspace-sidebar__account .chart-menu__trigger']){const el=p.locator(selector);await p.mouse.move(1,1);await p.waitForTimeout(160);const before=await el.evaluate(style);await el.hover();await p.waitForTimeout(160);assert.notEqual(await el.evaluate(style),before,`no hover feedback: ${selector}`);await p.screenshot({path:`${out}/${theme}-${selector.startsWith('.voice')?'dictate':'account'}-hover.png`});}
  const disabled=p.getByRole('button',{name:'Unavailable'});await p.mouse.move(1,1);await p.waitForTimeout(160);const before=await disabled.evaluate(style);await disabled.hover({force:true});await p.waitForTimeout(160);assert.equal(await disabled.evaluate(style),before,'disabled hover changed');
  const voice=p.locator('.voice-input:not(:disabled)');await p.mouse.move(1,1);await voice.evaluate(el=>el.classList.add('voice-input--recording'));await p.waitForTimeout(160);const recording=await voice.evaluate(el=>getComputedStyle(el).backgroundColor);await voice.hover();await p.waitForTimeout(160);assert.equal(await voice.evaluate(el=>getComputedStyle(el).backgroundColor),recording,'recording color must survive hover');await voice.evaluate(el=>el.classList.remove('voice-input--recording'));await voice.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');assert.equal(await voice.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/coverage.json`,JSON.stringify(coverage,null,2));console.log(JSON.stringify({cases:coverage.length,artifacts:out,errors}));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
