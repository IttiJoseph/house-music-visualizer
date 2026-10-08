// Dev-only page: renders one Strudel pattern to audio, offline (faster than real time,
// and sample-accurate). Driven by tools/render-stems.mjs through headless Chromium.
import { evalScope, repl } from '@strudel/core';
import '@strudel/mini';
import '@strudel/tonal';
import { transpiler } from '@strudel/transpiler';
import { miniAllStrings } from '@strudel/mini';
import {
  setAudioContext, initAudio, superdough,
  samples, aliasBank, registerSynthSounds,
} from '@strudel/webaudio';
import { registerSoundfonts } from '@strudel/soundfonts';

const SAMPLE_RATE = 44100;
const DOUGH = 'https://raw.githubusercontent.com/felixroos/dough-samples/main';

// FIRST THING: make the offline context the one Strudel uses (before any sound is registered).
const SECONDS = Number(new URLSearchParams(location.search).get('seconds') || 32);
const ctx = new OfflineAudioContext(2, SECONDS * SAMPLE_RATE, SAMPLE_RATE);
setAudioContext(ctx);

// Load everything the track needs: Strudel's functions, synths, drum samples and GM soundfonts.
const ready = (async () => {
  await evalScope(
    import('@strudel/core'), import('@strudel/mini'), import('@strudel/tonal'), import('@strudel/webaudio'),
  );
  miniAllStrings();
  await registerSynthSounds();
  await registerSoundfonts();
  await samples('github:tidalcycles/dirt-samples');
  await samples(`${DOUGH}/tidal-drum-machines.json`);
  aliasBank({ RolandTR707: 'tr707' });
})();

// A throw-away "repl" only used to evaluate the track text into a pattern (it never plays).
const evaluator = repl({ defaultOutput: () => {}, getTime: () => 0, transpiler });

async function evalPattern(code) {
  await ready;
  await evaluator.evaluate(code, false);
  return { pattern: evaluator.scheduler.pattern, cps: evaluator.scheduler.cps };
}

// Render `cycles` cycles of the pattern and return the audio as 16-bit stereo, plus onset times.
window.renderStem = async (code, { cycles, keepFrom, keepTo }) => {
  const { pattern, cps } = await evalPattern(code);
  const seconds = cycles / cps;

  if (Math.abs(seconds - SECONDS) > 1e-6) throw new Error(`page was set up for ${SECONDS}s, need ${seconds}s`);
  await initAudio({ maxPolyphony: 128 });

  // Schedule every note, in time order (some effects depend on that).
  const haps = pattern.queryArc(0, cycles, { _cps: cps })
    .filter((h) => h.hasOnset())
    .sort((a, b) => a.whole.begin.valueOf() - b.whole.begin.valueOf());
  for (const hap of haps) {
    hap.ensureObjectValue();
    await superdough(hap.value, hap.whole.begin.valueOf() / cps, hap.duration / cps, cps, hap.whole.begin.valueOf() / cps);
  }
  const buffer = await ctx.startRendering();

  // Keep only the requested slice (cycles keepFrom..keepTo) and convert to 16-bit.
  const a = Math.round((keepFrom / cps) * SAMPLE_RATE), b = Math.round((keepTo / cps) * SAMPLE_RATE);
  const out = new Int16Array((b - a) * 2);
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = a; i < b; i++) {
      const v = Math.max(-1, Math.min(1, data[i]));
      peak = Math.max(peak, Math.abs(data[i]));
      out[(i - a) * 2 + ch] = Math.round(v * 32767);
    }
  }
  // Note onsets (seconds from the start of the kept slice).
  const hits = pattern.queryArc(keepFrom, keepTo, { _cps: cps })
    .filter((h) => h.hasOnset())
    .map((h) => +((h.whole.begin.valueOf() - keepFrom) / cps).toFixed(4))
    .sort((x, y) => x - y);
  // Base64 so it can cross from the browser to Node.
  let bin = ''; const bytes = new Uint8Array(out.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { pcm: btoa(bin), peak, hits, frames: b - a, cps };
};
window.rendererReady = ready;
