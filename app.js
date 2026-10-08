// Night House — the whole live site's behaviour in one file.
//
//   1. ROOMS   the lights, buttons and captions (same behaviour as the original house)
//   2. ENGINE  plays the 9 pre-rendered stems in sync and fades each one in/out on the bar
//   3. HITS    watches the same clock to shake a room's furniture on every note
//
// No libraries. Audio files live in public/audio, note times in public/hits.json.
(() => {
  'use strict';

  // ───────────────────────── Settings (safe to tweak) ─────────────────────────

  // Which instrument each room plays.
  const STEM_FOR_ROOM = {
    attic: 'piano', library: 'groove', hall: 'snare', bath: 'hats', living: 'kick',
    nursery: 'epiano', reading: 'guitar', kitchen: 'percs', bedroom: 'bass',
  };
  const ROOM_NAMES = {
    attic: 'Attic music room', library: 'Tower library', hall: 'Hallway', bath: 'Bathroom',
    living: 'Living room', nursery: 'Nursery', reading: 'Reading nook', kitchen: 'Kitchen', bedroom: 'Bedroom',
  };

  const LOOP_SECONDS = 16;   // length of every stem
  const BAR_SECONDS = 2;     // 120 BPM, 4 beats = 1 bar = 2 s
  const FADE_SECONDS = 0.03; // volume fade when a room is switched on/off
  const MASTER_GAIN = 0.6;   // headroom: nine stems summed would otherwise clip

  // Shake size per instrument, in drawing units (about 1 px each). Set to 0 to turn one off.
  const SHAKE = {
    kick: 1.6, snare: 1.3, bass: 1.2, piano: 0.9, groove: 0.8,
    percs: 0.8, guitar: 0.7, epiano: 0.5, hats: 0.35,
  };
  const SHAKE_MS = 130;

  // ───────────────────────── 1. ROOMS ─────────────────────────

  const caption = document.getElementById('caption');
  const count = document.getElementById('count');
  let defaultCaption = caption.textContent; // what the caption shows when nothing is hovered
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const rooms = [...document.querySelectorAll('g.room[data-room]')].map((g) => {
    const id = g.dataset.room;
    return {
      id, g, name: ROOM_NAMES[id], stem: STEM_FOR_ROOM[id],
      hit: g.querySelector('.hit'),
      objs: g.querySelector('.objs'), // the furniture, wrapped so it can shake
      on: false,                      // light state (changes instantly on click)
      // audio state, filled in by the engine:
      gain: null, target: false, pending: null, changes: [{ t: -Infinity, on: false }],
    };
  });

  function paint(room) {
    room.g.classList.toggle('off', !room.on);
    room.hit.setAttribute('aria-pressed', String(room.on));
    room.hit.setAttribute('aria-label', `${room.name} light`);
  }

  function updateCount() {
    const n = rooms.filter((r) => r.on).length;
    count.innerHTML = engine.loading ? 'Tuning up…' : `<b>${n}</b> of ${rooms.length} lit`;
  }

  const label = (r) => `${r.name}: light ${r.on ? 'on' : 'off'}`;

  function toggle(room) {
    setRooms([[room, !room.on]]);
    room.g.classList.toggle('suppress', !room.on);
    caption.textContent = label(room);
  }

  // Flip lights immediately; tell the engine so the sound follows on the next bar.
  function setRooms(changes) {
    engine.unlock(); // the first click starts everything (browsers require a click before sound)
    const bar = engine.nextBar(); // same bar for every room changed together
    for (const [room, on] of changes) {
      room.on = on;
      paint(room);
      engine.setRoomAudible(room, on, bar);
    }
    updateCount();
  }

  rooms.forEach((room) => {
    paint(room);
    room.hit.addEventListener('click', () => toggle(room));
    room.hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(room); }
    });
    room.hit.addEventListener('pointerenter', () => { caption.textContent = label(room); });
    room.hit.addEventListener('focus', () => { caption.textContent = label(room); });
    room.hit.addEventListener('pointerleave', () => {
      room.g.classList.remove('suppress');
      caption.textContent = defaultCaption;
    });
  });
  document.getElementById('allOn').addEventListener('click', () => setRooms(rooms.map((r) => [r, true])));
  document.getElementById('allOff').addEventListener('click', () => setRooms(rooms.map((r) => [r, false])));

  // ───────────────────────── 2. ENGINE ─────────────────────────
  //
  // All nine stems are started at the same instant on one AudioContext clock and loop forever.
  // A room being "off" just means its volume is 0. Because nothing is ever restarted, the stems
  // can't drift apart. Changes are scheduled on the next bar line (every 2 s from `start`).

  const engine = {
    ctx: null,
    start: 0,           // AudioContext time at which every stem began (= bar 0)
    hits: null,         // hits.json: note times per stem
    loading: false,
    ready: false,
    failed: false,

    // Called from a click. Creates the audio system once and loads the stems.
    unlock() {
      if (this.ctx) {
        if (this.ctx.state !== 'running') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.ctx.resume(); // must happen inside the click for Safari / iOS
      this.loading = true;
      document.body.classList.add('loading');
      caption.textContent = defaultCaption = 'Tuning up the band…';
      this.load().then(
        () => {
          this.loading = false;
          document.body.classList.remove('loading');
          caption.textContent = defaultCaption = 'Click a room to switch on its light and its instrument.';
          updateCount();
        },
        (err) => {
          console.error(err);
          this.loading = false; this.failed = true;
          document.body.classList.remove('loading');
          caption.textContent = defaultCaption = "Couldn't load the music. Check your connection and reload.";
          updateCount();
        },
      );
    },

    async load() {
      const ctx = this.ctx;
      const stems = [...new Set(Object.values(STEM_FOR_ROOM))];
      const [buffers, hits] = await Promise.all([
        Promise.all(stems.map(async (stem) => {
          const res = await fetch(`public/audio/${stem}.m4a`);
          if (!res.ok) throw new Error(`Could not load ${stem}.m4a`);
          return [stem, await ctx.decodeAudioData(await res.arrayBuffer())];
        })),
        fetch('public/hits.json').then((r) => r.json()).catch(() => ({})), // only for the shake: optional
      ]);
      this.hits = hits;

      const master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);

      // Every room gets its own stem + its own volume knob (starting silent).
      const buffer = Object.fromEntries(buffers);
      const when = ctx.currentTime + 0.15; // one shared start time for all nine
      for (const room of rooms) {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(master);
        const src = ctx.createBufferSource();
        src.buffer = buffer[room.stem];
        src.loop = true;
        src.loopStart = 0;
        // Use the exact loop length so encoder padding at the end of the file never makes a gap.
        src.loopEnd = Math.min(LOOP_SECONDS, src.buffer.duration);
        src.connect(gain);
        src.start(when);
        room.gain = gain;
      }
      this.start = when;
      this.ready = true;

      // Rooms clicked while loading come in on the first bar after loading finishes.
      const bar = this.nextBar();
      for (const room of rooms) if (room.on) this.setRoomAudible(room, true, bar);
      requestAnimationFrame(hitLoop);
    },

    // AudioContext time of the next bar line (at least a few ms away so it can be scheduled).
    nextBar() {
      if (!this.ready) return 0; // not used until the stems are loaded
      const now = this.ctx.currentTime;
      const bars = Math.max(0, Math.ceil((now - this.start) / BAR_SECONDS));
      let t = this.start + bars * BAR_SECONDS;
      if (t - now < 0.02) t += BAR_SECONDS;
      return t;
    },

    // Fade a room's volume in/out starting exactly on `bar`.
    setRoomAudible(room, on, bar) {
      if (!this.ready) return; // handled by load() once the stems arrive
      const g = room.gain.gain;
      let p = room.pending;
      if (!p || p.bar !== bar) p = room.pending = { bar, from: room.target };
      else g.cancelScheduledValues(bar); // changed their mind within the same bar
      g.setValueAtTime(p.from ? 1 : 0, bar);
      g.linearRampToValueAtTime(on ? 1 : 0, bar + FADE_SECONDS);
      room.target = on;
      // Remember when this room is audible (used to time the shake). Drop old entries.
      room.changes = room.changes.filter((c) => c.t < bar);
      room.changes.push({ t: bar, on });
    },

    // Will this room be audible at audio-clock time t?
    audibleAt(room, t) {
      let on = false;
      for (const c of room.changes) if (c.t <= t) on = c.on;
      return on;
    },
  };

  // ───────────────────────── 3. HITS (shake) ─────────────────────────
  //
  // hits.json lists, per instrument, when each note lands within the 16 s loop. Every frame we
  // look at which notes have just been heard and call onHit() for each one in a lit room.

  let cursor = 0; // audio time up to which hits have been handled

  function hitLoop() {
    const ctx = engine.ctx;
    // Notes the listener is hearing *now* (the speakers lag the clock a little).
    const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    if (!cursor || heard - cursor > 0.5) cursor = Math.max(heard, engine.start); // tab was asleep: skip ahead
    if (heard > cursor && engine.hits) {
      for (const room of rooms) {
        const times = engine.hits[room.stem];
        if (!times) continue;
        const loop0 = Math.floor((cursor - engine.start) / LOOP_SECONDS);
        const loop1 = Math.floor((heard - engine.start) / LOOP_SECONDS);
        for (let loop = loop0; loop <= loop1; loop++) {
          const base = engine.start + loop * LOOP_SECONDS;
          for (const h of times) {
            const t = base + h;
            if (t > cursor && t <= heard && engine.audibleAt(room, t)) onHit(room);
          }
        }
      }
      cursor = heard;
    }
    requestAnimationFrame(hitLoop);
  }

  // One note was just heard in `room`. Add more visual reactions here
  // (for example a light flicker on room.g.querySelector('.light')).
  function onHit(room) {
    shake(room);
  }

  function shake(room) {
    const size = SHAKE[room.stem];
    if (!size || reduceMotion.matches || !room.objs.animate) return;
    const a = Math.random() * Math.PI * 2;
    const dx = Math.cos(a) * size, dy = Math.sin(a) * size;
    room.objs.animate(
      [
        { transform: 'translate(0px, 0px)' },
        { transform: `translate(${dx}px, ${dy}px)`, offset: 0.2 },
        { transform: `translate(${-dx * 0.5}px, ${-dy * 0.5}px)`, offset: 0.55 },
        { transform: 'translate(0px, 0px)' },
      ],
      { duration: SHAKE_MS, easing: 'ease-out' },
    );
  }

  updateCount();
})();
