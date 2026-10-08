// One-off: splits public/img/house-music-title.svg into two files, one per word, each cropped
// to its own letters (public/img/title-house.svg and title-music.svg). The original is kept.
// The artwork is two big compound paths (a dark shadow and a white face) with every letter
// glued together, so we cut them into outlines and sort the outlines by horizontal position.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'public/img/house-music-title.svg'), 'utf8');
const [shadowD, faceD] = [...src.matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)].map((m) => m[1]);
const fills = [...src.matchAll(/<path d="[^"]+" fill="([^"]+)"/g)].map((m) => m[1]);
const GAP = { shadow: 249, face: 245 }; // x position of the gap between "House" and "Music" in each layer

const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(({ shadowD, faceD, GAP }) => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); document.body.appendChild(svg);
  const split = (d, gap) => {
    const words = { house: [], music: [] };
    for (const sub of d.split(/(?=M)/)) {
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', sub); svg.appendChild(p);
      const b = p.getBBox(); p.remove();
      (b.x + b.width / 2 < gap ? words.house : words.music).push(sub);
    }
    return { house: words.house.join(''), music: words.music.join(''), counts: [words.house.length, words.music.length] };
  };
  const sh = split(shadowD, GAP.shadow), fc = split(faceD, GAP.face);
  const box = (ds) => { // union bounding box of several paths
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const d of ds) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); const b = p.getBBox(); p.remove();
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
    return { x: x0 - 2, y: y0 - 2, w: x1 - x0 + 4, h: y1 - y0 + 4 };
  };
  return { sh, fc, house: box([sh.house, fc.house]), music: box([sh.music, fc.music]) };
}, { shadowD, faceD, GAP });
await browser.close();

for (const word of ['house', 'music']) {
  const b = result[word], r = (n) => +n.toFixed(2);
  const svg = `<svg width="${r(b.w)}" height="${r(b.h)}" viewBox="${r(b.x)} ${r(b.y)} ${r(b.w)} ${r(b.h)}" fill="none" xmlns="http://www.w3.org/2000/svg">\n`
    + `<path d="${result.sh[word]}" fill="${fills[0]}"/>\n<path d="${result.fc[word]}" fill="${fills[1]}"/>\n</svg>\n`;
  fs.writeFileSync(path.join(root, `public/img/title-${word}.svg`), svg);
  console.log(word, 'outlines (shadow, face):', result.sh.counts[word === 'house' ? 0 : 1], result.fc.counts[word === 'house' ? 0 : 1], 'box', JSON.stringify({ x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) }));
}
