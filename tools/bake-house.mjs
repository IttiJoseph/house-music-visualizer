// One-off: runs source/house.html (which draws the house with rough.js) in a hidden browser
// and saves the finished drawing as plain SVG markup -> tools/house-baked.svg.
// rough.js is seeded, so the output is identical every time. The result was pasted into
// ../index.html, so the live site no longer needs rough.js. Only re-run if the drawing changes.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + path.join(here, '../source/house.html'));
await page.waitForSelector('g.room .hit');
const svg = await page.evaluate(() => {
  const s = document.getElementById('scene');
  const ids = [...s.querySelectorAll('clipPath')].map((c) => c.id.replace('clip-', ''));
  [...s.querySelectorAll('g.room')].forEach((g, i) => {
    g.setAttribute('data-room', ids[i]);
    g.setAttribute('class', 'room off');
    // wrap the furniture in its own group so it can shake without moving its clip mask
    const clipped = [...g.children].find((c) => c.tagName === 'g' && c.hasAttribute('clip-path') && !c.classList.contains('light'));
    const inner = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    inner.setAttribute('class', 'objs');
    while (clipped.firstChild) inner.appendChild(clipped.firstChild);
    clipped.appendChild(inner);
    g.querySelector('.hit').setAttribute('aria-pressed', 'false');
  });
  return s.outerHTML;
});
fs.writeFileSync(path.join(here, 'house-baked.svg'), svg);
console.log('baked', svg.length, 'bytes');
await browser.close();
