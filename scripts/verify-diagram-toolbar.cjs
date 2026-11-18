// Run with Playwright installed and the local Vite server on port 5175.
const {chromium}=require('playwright');
const fs=require('fs');fs.mkdirSync('/tmp/diagram-toolbar-shots',{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const results=[];
 for (const locked of [false,true]) {
 await page.goto('http://127.0.0.1:5175/scripts/fixtures/diagram-toolbar-preview.html'+(locked?'?locked':''));
 await page.locator('.diagram-view__toolbar').first().waitFor();
 for(const lng of ['en','de']) {
 await page.evaluate(lng=>window.setLanguage(lng),lng);
 for(const width of [1440,1100,390,320]) {
 await page.setViewportSize({width,height:1100});
 for(const draw of locked?[false]:[false,true]) {
 const toolbar=page.locator('.diagram-view__toolbar').first();
 if(!locked) await toolbar.locator('.diagram-view__tool-group button').nth(draw?2:0).click();
 const more=toolbar.locator('.diagram-view__more');
 const compact=await more.isVisible();
 if(width===1440 && compact) throw new Error('Wide toolbar must expose its secondary tools');
 if(width<600 && !compact) throw new Error('Phone toolbar must use More tools');
 if(width===1100 && lng==='en' && !draw && compact) throw new Error('English Mark toolbar should fit inline at 1100px');
 if(width===1100 && draw && !compact) throw new Error('Drawing controls should stay disclosed at 1100px');
 if(compact && await more.getAttribute('aria-expanded')!=='true') await more.click();
 const overflow=await toolbar.evaluate(el=>el.scrollWidth>el.clientWidth);
 if(overflow) throw new Error('Toolbar overflow '+JSON.stringify({lng,width,draw,locked}));
 if(width<600) {
 for(const b of await toolbar.locator('button:visible').all()) {
 const box=await b.boundingBox(); if(box.height<44 || box.width<43) throw new Error('Small touch target '+await b.textContent()+JSON.stringify(box));
 }
 }
 const key=[lng,width,draw?'draw':'mark',locked?'locked':'edit'].join('-');
 await page.screenshot({path:'/tmp/diagram-toolbar-shots/'+key+'.png',fullPage:true});
 results.push({key,compact});
 if(compact) await page.keyboard.press('Escape');
 }
 }
 }
 }
 if(errors.length) throw new Error(errors.join('\n'));
 console.log(JSON.stringify(results));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
