// Screenshots the Settings page (Phase 10) in the running dev app: the panels, an import error,
// the in-page import confirm and the Report an issue preview, plus the number styles in the
// header. Start the app with `BI_PROFILE=ui npx electron-vite dev -- --remote-debugging-port=9333`,
// then run `node scripts/shoot-settings.mjs [port] [outDir]`. It changes the UI preferences
// (restored at the end) but not the save.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const port = process.argv[2] ?? '9333';
const out = process.argv[3] ?? 'design/app-screens/settings';
mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => !p.url().startsWith('devtools'));
if (!page) throw new Error('No app window found');
await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => undefined);
await page.waitForSelector('.shell');

const prefsBefore = await page.evaluate(() => localStorage.getItem('bi.ui'));
await page.click('[data-open="settings"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/settings.png` });

// import: a broken string shows the error
const settings = page.locator('.shell-page[data-page="settings"]');
await settings.locator('textarea').fill('hello, this is not a save');
await settings.getByRole('button', { name: 'Import save' }).click();
await page.waitForTimeout(150);
await settings.locator('.set-grid > :nth-child(3)').screenshot({ path: `${out}/import-error.png` });

// import: a real export shows the in-page confirm
await settings.getByRole('button', { name: 'Copy to clipboard' }).click();
const exported = await page.evaluate(async () => {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return document.querySelector('.set-text')?.value ?? '';
  }
});
await settings.locator('textarea').fill(exported);
await settings.getByRole('button', { name: 'Import save' }).click();
await page.waitForTimeout(150);
await settings
  .locator('.set-grid > :nth-child(3)')
  .screenshot({ path: `${out}/import-confirm.png` });
await settings.getByRole('button', { name: 'Keep current game' }).click();
await settings.locator('textarea').fill('');

// help: what the issue will contain
await settings.locator('.set-details summary').click();
await page.waitForTimeout(150);
await settings
  .locator('.set-grid > :nth-child(4)')
  .screenshot({ path: `${out}/report-preview.png` });
const issueUrl = await page.evaluate(async () => {
  let url = '';
  const open = window.open;
  window.open = (u) => {
    url = String(u);
    return null;
  };
  document.querySelector('.set-grid > :nth-child(4) .button')?.click();
  window.open = open;
  return url;
});
console.log('issue url length', issueUrl.length);
console.log(decodeURIComponent(issueUrl.slice(0, 400)));

// numbers and motion: suffix style, reduced motion on; check the CSSOM override took
await settings.getByText('Suffixes').click();
await settings.locator('.set-seg__opt', { hasText: /^On$/ }).click();
const motion = await page.evaluate(() => ({
  attr: document.documentElement.dataset.motion ?? null,
  query: matchMedia('(prefers-reduced-motion: reduce)').matches,
  fallback: document.documentElement.classList.contains('motion-fallback'),
  rules: Array.from(document.styleSheets).flatMap((s) => {
    try {
      return Array.from(s.cssRules)
        .filter((r) => r instanceof CSSMediaRule)
        .map((r) => r.media.mediaText);
    } catch {
      return ['<unreadable>'];
    }
  }),
}));
console.log('motion', motion.attr, motion.query, motion.fallback, [...new Set(motion.rules)]);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/settings-suffix-reduced.png` });

await page.evaluate((p) => {
  if (p === null) localStorage.removeItem('bi.ui');
  else localStorage.setItem('bi.ui', p);
}, prefsBefore);
await browser.close();
console.log('screenshots in', out);
