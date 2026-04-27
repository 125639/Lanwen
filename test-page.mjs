import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', err => errors.push(err.message));
try {
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/linguaflash-screenshot.png', fullPage: false });
  console.log('Screenshot saved to /tmp/linguaflash-screenshot.png');
  const text = await page.locator('.app-root-shell').first().textContent().catch(() => 'N/A');
  console.log('Content preview:', text?.slice(0, 200));
  console.log('JS errors:', errors.length === 0 ? 'none' : errors.join(', '));
} catch (e) {
  console.log('Error:', e.message);
}
await browser.close();
