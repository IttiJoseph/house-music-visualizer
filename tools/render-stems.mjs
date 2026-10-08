// Renders the 9 Night House stems. Usage:  node render-stems.mjs [room ...]
// Reads ../source/track.js, plays ONE room's layer at a time, offline, and saves
// renders/<stem>.wav (44.1 kHz stereo, 16 s loop) plus ../public/hits.json.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const STEMS = ['kick', 'bass', 'snare', 'hats', 'groove', 'percs', 'epiano', 'piano', 'guitar'];
const args = process.argv.slice(2);
const hitsOnly = args.includes('--hits-only');   // re-export hits.json without touching the .wav files
const named = args.filter((a) => !a.startsWith('--'));
const wanted = named.length ? named : STEMS;

const LOOP_CYCLES = 8;             // 8 cycles x 2 s = 16 s
const RENDER_CYCLES = 16;          // render twice as long, keep the second half,
                                   // so reverb/delay tails from the previous pass are already there.

// Everything in track.js before the "PLAY" section defines the layers.
const full = fs.readFileSync(path.join(root, 'source/track.js'), 'utf8');
const definitions = full.slice(0, full.indexOf('// ── PLAY'));

function wav(pcmBase64, frames, rate = 44100) {
  const pcm = Buffer.from(pcmBase64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const server = await createServer({ root: path.join(here, 'render'), configFile: false, server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
// Strudel ties parts of its audio graph to the first audio context it sees, so every stem
// gets a brand-new page whose offline (faster-than-real-time) context is set up first.
async function freshPage() {
  const page = await browser.newPage();
  page.on('console', (m) => { if (['error'].includes(m.type())) console.log('  [browser]', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('  [page error]', e.message.slice(0, 300)));
  await page.goto(`http://localhost:5199/?seconds=${RENDER_CYCLES * 2}`);
  await page.evaluate(() => window.rendererReady);
  return page;
}

fs.mkdirSync(path.join(here, 'renders'), { recursive: true });
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
const hitsFile = path.join(root, 'public/hits.json');
const hits = fs.existsSync(hitsFile) && wanted.length < STEMS.length ? JSON.parse(fs.readFileSync(hitsFile, 'utf8')) : {};

for (const name of wanted) {
  process.stdout.write(`Rendering ${name}... `);
  const page = await freshPage();
  const r = await page.evaluate(
    ([code, opts]) => window.renderStem(code, opts),
    [`${definitions}\n${name}`, { cycles: RENDER_CYCLES, keepFrom: RENDER_CYCLES - LOOP_CYCLES, keepTo: RENDER_CYCLES }],
  );
  await page.close();
  if (!hitsOnly) fs.writeFileSync(path.join(here, 'renders', `${name}.wav`), wav(r.pcm, r.frames));
  hits[name] = r.hits;
  // Stems made of several sounds also get one list per sound, e.g. "hats:hh" and "hats:tr707_hh".
  for (const key of Object.keys(hits)) if (key.startsWith(`${name}:`)) delete hits[key];
  if (Object.keys(r.bySound).length > 1) for (const [snd, t] of Object.entries(r.bySound)) hits[`${name}:${snd}`] = t;
  console.log(`${r.hits.length} hits, peak ${r.peak.toFixed(2)}, ${(r.frames / 44100).toFixed(3)} s`);
}
const ordered = Object.fromEntries(Object.keys(hits).sort((a, b) => STEMS.indexOf(a.split(':')[0]) - STEMS.indexOf(b.split(':')[0]) || a.localeCompare(b)).map((k) => [k, hits[k]]));
fs.writeFileSync(hitsFile, JSON.stringify(ordered));
await browser.close(); await server.close();
