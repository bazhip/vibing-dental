// With Vite running: PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/verify-rabbit.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
const assert = require('node:assert/strict');
const out = process.env.RABBIT_SCREENSHOTS || '/tmp/rabbit-review';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('vibing-dental.diagram.showToothNumbers.v1', 'true'));
  const rows = [];
  for (const native of [false, true]) {
    for (const width of native ? [390, 320] : [1280, 390, 320]) {
      for (const empty of [false, true]) {
        await page.setViewportSize({ width, height: 1000 });
        const query = new URLSearchParams({ iosPreview: native ? '1' : '0', ...(empty ? { empty: '1' } : {}) });
        await page.goto(`http://127.0.0.1:5187/scripts/fixtures/rabbit-preview.html?${query}`);
        await page.locator('[data-triadan="102"]').waitFor();
        for (const lng of native ? ['en'] : ['en', 'de']) {
          await page.evaluate(lng => window.setLanguage(lng), lng);
          assert.equal(await page.locator('[data-triadan]').count(), 28);
          assert.equal(await page.locator('.tooth-numbers text').count(), 28);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow: ${native}/${width}/${lng}`);
          if (width < 600) {
            for (const control of await page.locator('.patient-form__species-controls .species-tab, .patient-form__species-controls .ios-segmented__segment').all()) {
              const box = await control.boundingBox();
              assert.ok(box.height >= 44, `short species control: ${JSON.stringify(box)}`);
            }
          }
          if (native) {
            const overlap = await page.locator('.patient-form__choice-row').evaluateAll(rows => rows.some(row => {
              const a = row.querySelector('.ios-field__label').getBoundingClientRect();
              const b = row.querySelector('.ios-field__control').getBoundingClientRect();
              return Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
            }));
            assert.equal(overlap, false, 'native choice labels must not overlap controls');
          }
          const key = `${native ? 'native' : 'web'}-${width}-${empty ? 'empty' : 'populated'}-${lng}`;
          await page.screenshot({ path: `${out}/${key}.png`, fullPage: true });
          // Check number boxes against one another and all tooth outlines.
          const collisions = await page.locator('.tooth-numbers text').evaluateAll(labels => {
            const boxes = labels.map(el => ({ id: el.textContent, b: el.getBoundingClientRect() }));
            const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
            const teeth = [...document.querySelectorAll('[data-triadan]')].map(el => ({ id: el.getAttribute('data-triadan'), b: el.getBoundingClientRect() }));
            return boxes.flatMap((a, i) => [
              ...boxes.slice(i + 1).filter(b => overlaps(a.b, b.b)).map(b => `${a.id}/${b.id}`),
              ...teeth.filter(b => overlaps(a.b, b.b)).map(b => `number ${a.id}/tooth ${b.id}`),
            ]);
          });
          assert.deepEqual(collisions, [], `labels collide: ${key}`);
          rows.push({ key, teeth: 28, numbers: 28, overflow: false });
        }
        const numbers = page.locator('.diagram-view__numbers');
        await numbers.click();
        assert.equal(await page.locator('.tooth-numbers text').count(), 0);
        await page.screenshot({ path: `${out}/${native ? 'native' : 'web'}-${width}-${empty ? 'empty' : 'populated'}-numbers-off.png`, fullPage: true });
        await numbers.click();
        assert.equal(await page.locator('.tooth-numbers text').count(), 28);
        // The peg incisor can be marked with the keyboard independently.
        const peg = page.locator('[data-triadan="102"]');
        await peg.focus();
        await page.keyboard.press('Enter');
        assert.equal(await peg.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-triadan="101"]').getAttribute('aria-pressed'), 'false');
        await page.keyboard.press('Enter');
        const other = page.locator('.patient-form__other-select');
        await other.selectOption('equine');
        await page.waitForFunction(() => document.querySelectorAll('[data-triadan]').length === 44);
        await page.screenshot({ path: `${out}/${native ? 'native' : 'web'}-${width}-equine.png`, fullPage: true });
        await other.selectOption('rabbit');
        await page.waitForFunction(() => document.querySelectorAll('[data-triadan]').length === 28);
        await other.focus();
        await page.screenshot({ path: `${out}/${native ? 'native' : 'web'}-${width}-selector-focus.png`, fullPage: true });
        // Native select options are OS/browser rendered. Capture the open picker
        // separately; Escape must close it without changing the species.
        await other.click();
        await page.screenshot({ path: `${out}/${native ? 'native' : 'web'}-${width}-selector-open.png` });
        await page.keyboard.press('Escape');
        assert.equal(await other.inputValue(), 'rabbit');
      }
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/coverage.json`, JSON.stringify(rows, null, 2));
  console.log(JSON.stringify({ screenshots: out, cases: rows.length, pageErrors: errors }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
