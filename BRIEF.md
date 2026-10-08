# Night House — build brief

A hand-drawn house cross-section where each of 9 rooms plays one layer of a fixed
jazz-house track. Click a room: its light turns on and its layer joins the beat.
Click again: light off, layer drops out.

The person building this is a designer, not a developer. Explain what you're doing
in plain words, make decisions yourself where this brief is silent, and keep the
project as small and dependency-free as possible.

## Source files (in `source/`)

- `house.html` — the finished interactive house (rough.js, 9 room polygons, light on/off).
  It's a page fragment: add your own `<!doctype html>`, `<head>` and `<body>`.
- `track.js` — the finished Strudel track. One `let` per room, all combined in `stack()`.
  120 BPM, 1 Strudel cycle = 1 bar = 2 seconds.

Neither the music nor the drawing should change. Same sounds, same patterns, same volumes.

## Core decision: pre-render the audio, no Strudel on the live site

Nothing is customisable, so the live site does NOT run Strudel. Instead:

1. **Render 9 audio stems once, on this computer**, one per room, using Strudel and its
   real sounds. Each stem is that room's layer playing solo at its final volume.
2. **Ship the stems as audio files** in the project. The live site loops all 9 in sync
   with the Web Audio API and fades each room's volume in or out when it's clicked.

Result: no calls to GitHub, Strudel or soundfont hosts at runtime, no music library on
the live site, and perfect sync because every stem starts at the same instant.

## Step 1 — Render the stems (dev-only tooling)

Put all rendering tooling in `tools/` so it never ships to the live site.

- **Loop length: 8 cycles = 16 seconds.** That covers every alternating pattern in the
  track (chords, piano struct and bass alternation all repeat within 8 cycles).
- **Seamless loops:** render 16 cycles per stem and keep only cycles 9–16, so reverb and
  delay tails from the previous pass are already present at the loop start.
- The guitar's `perlin` filter doesn't repeat. That's fine: whatever 16-second slice
  is captured becomes the fixed version.
- Use `@strudel/web` (or the core packages plus `@strudel/soundfonts`, needed for the
  `gm_` sounds) in a local page driven by headless Chromium/Playwright, recording each
  stem from the audio output. Any approach that produces sample-accurate 16 s stems is fine.
- Render each room by playing only that room's variable from `track.js`.
- Save as 44.1 kHz stereo WAV in `tools/renders/`, then encode web versions into
  `public/audio/` (`kick.m4a` etc. — AAC works in every browser including iOS Safari).
  Keep the total under ~5 MB.
- **Also export hit times** for every room: query each pattern for note onsets within
  the 8-cycle loop and save them as `public/hits.json`
  (`{ "kick": [0, 0.5, 1.0, ...], ... }`, seconds from loop start). Not used yet; it's
  for a later light-flicker-on-each-hit effect.
- Write a short `tools/README.md` saying how to re-render if the track ever changes.

## Step 2 — Room → instrument mapping

| Room id   | Room             | Stem   |
|-----------|------------------|--------|
| `attic`   | Attic music room | piano  |
| `library` | Tower library    | groove |
| `hall`    | Hallway          | snare  |
| `bath`    | Bathroom         | hats   |
| `living`  | Living room      | kick   |
| `nursery` | Nursery          | epiano |
| `reading` | Reading nook     | guitar |
| `kitchen` | Kitchen          | percs  |
| `bedroom` | Bedroom          | bass   |

## Step 3 — The live site

- Plain static site: `index.html`, one CSS file, one JS file, `public/audio/`, `hits.json`.
  No framework and no build step unless there's a strong reason.
- **Bake the house drawing:** rough.js is seeded, so its output is the same every time.
  Generate the SVG once and save it as static markup, then drop rough.js from the live
  site. Keep each room as a `<g>` with `data-room="<id>"` and its existing light / night
  layers, so CSS and JS can target it.
- **Audio engine:**
  - All rooms start **off**. Nothing loads or plays until the first click (browsers need
    a click before sound). Show a simple loading state while the 9 stems decode.
  - On start, create all 9 `AudioBufferSourceNode`s with `loop = true`, each into its own
    gain node set to 0, and start them all at the same `AudioContext` time.
  - Set `loopStart`/`loopEnd` from the exact 16 s duration so encoder padding never
    causes a gap.
  - **Toggle quantised to the next bar:** a click flips the light immediately, but the
    volume fade (about 30 ms) is scheduled at the next 2-second bar boundary.
  - "All on" / "All off" buttons stay, also quantised.
- Keep keyboard access and `aria-pressed` from the original house.
- Keep the code tidy and commented so these can be added later without a rewrite:
  - a light flicker/pulse on every hit, using `hits.json` and the shared loop clock
  - a custom background
  - a title font

## Step 4 — Ship it

- Initialise a git repo, commit, and help create a GitHub repository and push to it.
- Test locally first and confirm: all 9 rooms play in sync, loops have no clicks or gaps,
  toggles land on the bar, it works in Safari and on a phone.
