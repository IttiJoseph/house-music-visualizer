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
// The drawing code is patched on the fly (the original file is never modified) so that every
// piece of furniture is tagged with the object it belongs to. Object boundaries are the
// comments inside each room's draw code ("// sofa", "// fridge"...) and the lamp/armchair helpers.
let src = fs.readFileSync(path.join(here, '../source/house.html'), 'utf8');
const HELPERS = 'pendantCone|pendantDome|pendantGlobe|lantern|bowlLamp|blobLamp|mirrorLight|tallLamp|tableLamp|sideTable|armchair|note|star';
src = src
  .replace("const NS = 'http://www.w3.org/2000/svg';", "window.__g = 0; window.__mark = () => { window.__g++; };\n  const NS = 'http://www.w3.org/2000/svg';")
  .replace('const put = (p, n) => (p.appendChild(n), n);', "const put = (p, n) => { p.appendChild(n); if (p.dataset && p.dataset.objs) n.setAttribute('data-grp', window.__g); return n; };")
  .replace(new RegExp(`^(  const (?:${HELPERS}) = \\([^)]*\\) => \\{)$`, 'gm'), '$1 window.__mark();')
  .replace('D.poly(g, [[246, 540], [262, 540]', "window.__mark(); D.poly(g, [[246, 540], [262, 540]") // bathroom: plant separate from the mat
  .replace('r.draw(objs);', "objs.setAttribute('data-objs', '1'); r.draw(objs);");
const a = src.indexOf('const fixtures = {'), z = src.indexOf('const rooms = roomDefs.map');
src = src.slice(0, a)
  + src.slice(a, z)
      .replace(/^(\s{8,})\/\/ (.*)$/gm, '$1window.__mark(); // $2')
      .replace(new RegExp(`^(\\s{8}(?:${HELPERS})\\(.*\\);)$`, 'gm'), '$1 window.__mark();')
  + src.slice(z);
const patched = path.join(here, 'house-patched.tmp.html');
fs.writeFileSync(patched, src);
await page.goto('file://' + patched);
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
    // group the furniture into separate objects (consecutive pieces with the same tag, so the
    // drawing order is untouched); each becomes <g class="item"> and can shake on its own
    let item = null, last = null;
    for (const piece of [...clipped.children]) {
      const grp = piece.getAttribute('data-grp');
      piece.removeAttribute('data-grp');
      if (grp !== last) { item = document.createElementNS('http://www.w3.org/2000/svg', 'g'); item.setAttribute('class', 'item'); inner.appendChild(item); last = grp; }
      item.appendChild(piece);
    }
    clipped.removeAttribute('data-objs');
    clipped.appendChild(inner);
    g.querySelector('.hit').setAttribute('aria-pressed', 'false');
  });
  return s.outerHTML;
});
fs.writeFileSync(path.join(here, 'house-baked.svg'), svg);
const perRoom = await page.evaluate(() => [...document.querySelectorAll('g.room')].map((g) => g.dataset.room + ':' + g.querySelectorAll('.item').length).join('  '));
console.log('objects per room ->', perRoom);
fs.rmSync(patched);
console.log('baked', svg.length, 'bytes');
await browser.close();
