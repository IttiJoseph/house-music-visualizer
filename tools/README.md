# Night House — audio rendering tools (dev only)

Nothing in `tools/` is part of the live site. It only exists to turn `source/track.js`
into the audio files the site plays.

## Re-render after changing the track

```bash
cd tools
npm install            # first time only
npx playwright install chromium   # first time only
node render-stems.mjs  # renders all 9 stems (about a minute)
node render-stems.mjs kick bass   # or just some of them
```

This writes:

- `tools/renders/<stem>.wav` — 44.1 kHz stereo, exactly 16 s (not committed to git)
- `public/hits.json` — note-onset times (seconds) per stem, for the future flicker effect

Then encode the web versions (macOS built-in encoder, no installs needed):

```bash
cd ..
for s in kick bass snare hats groove percs epiano piano guitar; do
  afconvert -f m4af -d aac -b 128000 tools/renders/$s.wav public/audio/$s.m4a
done
```

## How it works

1. `render-stems.mjs` starts a tiny local server and a hidden Chromium browser.
2. For each room it loads `render/index.html` (Strudel + its sample/soundfont libraries),
   evaluates the top of `source/track.js` and plays **only that room's variable**.
3. Strudel renders 16 cycles (32 s) faster than real time into an offline audio buffer.
   Only cycles 9–16 are kept, so reverb/delay tails are already present at the loop start.
4. The 16 s loop covers every alternating pattern in the track (all repeat within 8 cycles).
   The guitar's `perlin` filter never repeats, so the captured slice is the fixed version.

Needs an internet connection while rendering (it downloads Strudel's drum samples and
General MIDI soundfonts). The live site never does.

`listen.html` is a small page for auditioning the stems:
`python3 -m http.server 8765` from the project root, then open
`http://localhost:8765/tools/listen.html`.
