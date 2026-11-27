const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  try {
    for (const viewport of [{ width: 800, height: 360 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:8765');
      assert.equal(await page.locator('#formation').isVisible(), false);
      await page.locator('#pilot').selectOption('coil');
      await page.reload();
      assert.equal(await page.locator('#pilot').inputValue(), 'coil');
      await page.locator('#mode').selectOption('formation');
      assert.equal(await page.locator('#formation').isVisible(), true);
      await page.locator('#count').selectOption('5');
      await page.getByText('Start Battle').tap();
      await page.waitForFunction(() => document.querySelector('#status').textContent === 'Battle in progress');
      await page.getByLabel('Move up').tap();
      await page.getByRole('button', { name: 'Pause' }).tap();
      await page.waitForFunction(() => document.querySelector('#status').textContent === 'Paused');
      await page.locator('#mode').selectOption('survival');
      await page.getByText('Start Battle').tap();
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Wave 1'));
      assert.deepEqual(errors, []);
      console.log('Browser smoke test passed at', viewport);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
