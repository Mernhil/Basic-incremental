// Scales the approved app icon (build/icon.png) to the sizes of the home-screen app: resize only,
// no new art. Output goes to web-app/public (committed). Run: node scripts/make-web-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const src = `data:image/png;base64,${readFileSync('build/icon.png').toString('base64')}`;
const sizes = {
  'web-app/public/apple-touch-icon.png': 180,
  'web-app/public/icons/icon-192.png': 192,
  'web-app/public/icons/icon-512.png': 512,
};

const browser = await chromium.launch({ args: ['--mute-audio'] });
try {
  const page = await browser.newPage();
  const out = await page.evaluate(
    async ({ src, sizes }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const result = {};
      for (const [path, size] of Object.entries(sizes)) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        // a whole-number enlargement stays crisp; a reduction is smoothed
        g.imageSmoothingEnabled = size < img.width;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, size, size);
        result[path] = c.toDataURL('image/png').split(',')[1];
      }
      return result;
    },
    { src, sizes },
  );
  for (const [path, b64] of Object.entries(out)) writeFileSync(path, Buffer.from(b64, 'base64'));
} finally {
  await browser.close();
}
