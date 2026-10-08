// Night House — the whole live site's behaviour in one file.
//
//   1. ROOMS   the lights and clickable rooms (same behaviour as the original house)
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

  // Shake: every note nudges each object in the room in its own random direction.
  // One distance for every instrument, so a hi-hat is as visible as a kick.
  const SHAKE_DISTANCE = 3;   // in drawing units (about 1.4 px each on a wide screen)
  const SHAKE_SPREAD_MS = 40; // each object starts up to this much late, so they don't move in lockstep
  const SHAKE_MS = 150;

  // Optional: make different objects in a room react to different sounds of its instrument.
  // `sound` names a list in hits.json, `items` are the room's objects counted from 0 in drawing
  // order. A room not listed here shakes all its objects on every note.
  const REACTIONS = {
    bath: [
      { sound: 'hats:hh',        items: [0, 3] }, // closed hat  -> mirror, plant
      { sound: 'hats:tr707_hh',  items: [1] },    // offbeat hat -> sink  (item 2, the mat, stays still)
    ],
  };

  // ───────────────────────── 1. ROOMS ─────────────────────────

  // Invisible status line for screen readers; it only becomes visible if the music fails to load.
  const status = document.getElementById('status');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const rooms = [...document.querySelectorAll('g.room[data-room]')].map((g) => {
    const id = g.dataset.room;
    return {
      id, g, name: ROOM_NAMES[id], stem: STEM_FOR_ROOM[id],
      hit: g.querySelector('.hit'),
      items: [...g.querySelectorAll('.item')], // each piece of furniture, shaken separately
      reactions: null,                         // filled in just below
      on: false,                      // light state (changes instantly on click)
      // audio state, filled in by the engine:
      gain: null, target: false, changes: [{ t: -Infinity, on: false }],
    };
  });

  rooms.forEach((room) => {
    const all = room.items.map((_, i) => i);
    room.reactions = (REACTIONS[room.id] || [{ sound: room.stem, items: all }])
      .map((r) => ({ sound: r.sound, items: r.items.map((i) => room.items[i]) }));
  });

  function paint(room) {
    room.g.classList.toggle('off', !room.on);
    room.hit.setAttribute('aria-pressed', String(room.on));
    room.hit.setAttribute('aria-label', `${room.name} light`);
  }

  const label = (r) => `${r.name}: light ${r.on ? 'on' : 'off'}`;

  function toggle(room) {
    setRooms([[room, !room.on]]);
    room.g.classList.toggle('suppress', !room.on);
    status.textContent = label(room);
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
  }

  rooms.forEach((room) => {
    paint(room);
    room.hit.addEventListener('click', () => toggle(room));
    room.hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(room); }
    });
    room.hit.addEventListener('pointerleave', () => room.g.classList.remove('suppress'));
  });

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
      status.textContent = 'Tuning up the band…';
      this.load().then(
        () => {
          this.loading = false;
          document.body.classList.remove('loading');
          status.textContent = '';
        },
        (err) => {
          console.error(err);
          this.loading = false; this.failed = true;
          document.body.classList.remove('loading');
          status.textContent = "Couldn't load the music. Check your connection and reload.";
          status.classList.add('error'); // make it visible
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

    // Switching ON waits for `bar` (the next bar line), so the layer enters on the beat.
    // Switching OFF is immediate (a 30 ms fade, so there is no click).
    setRoomAudible(room, on, bar) {
      if (!this.ready || room.target === on) return; // before loading, load() sets the sound up
      const g = room.gain.gain;
      const now = this.ctx.currentTime;
      const at = on ? bar : now + 0.005;
      const from = on ? 0 : g.value; // volume right now (0 if it was still waiting for its bar)
      g.cancelScheduledValues(on ? bar : now); // drop any change that hasn't happened yet
      g.setValueAtTime(from, at);
      g.linearRampToValueAtTime(on ? 1 : 0, at + FADE_SECONDS);
      room.target = on;
      // Remember when this room is audible (used to time the shake). Drop entries that no longer apply.
      room.changes = room.changes.filter((c) => c.t < at);
      room.changes.push({ t: at, on });
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
        const loop0 = Math.floor((cursor - engine.start) / LOOP_SECONDS);
        const loop1 = Math.floor((heard - engine.start) / LOOP_SECONDS);
        for (const reaction of room.reactions) {
          const times = engine.hits[reaction.sound];
          if (!times) continue;
          for (let loop = loop0; loop <= loop1; loop++) {
            const base = engine.start + loop * LOOP_SECONDS;
            for (const h of times) {
              const t = base + h;
              if (t > cursor && t <= heard && engine.audibleAt(room, t)) onHit(room, reaction.items);
            }
          }
        }
      }
      cursor = heard;
    }
    requestAnimationFrame(hitLoop);
  }

  // One note was just heard in `room`; `items` are the objects that react to it.
  // Add more visual reactions here (for example a light flicker on room.g.querySelector('.light')).
  function onHit(room, items) {
    shake(items);
  }

  function shake(items) {
    if (reduceMotion.matches) return;
    for (const item of items) {
      // Each object picks its own direction and its own tiny delay.
      const angle = Math.random() * Math.PI * 2;
      const dx = Math.cos(angle) * SHAKE_DISTANCE, dy = Math.sin(angle) * SHAKE_DISTANCE;
      item.animate(
        [
          { transform: 'translate(0px, 0px)' },
          { transform: `translate(${dx}px, ${dy}px)`, offset: 0.25 },
          { transform: `translate(${-dx * 0.4}px, ${-dy * 0.4}px)`, offset: 0.6 },
          { transform: 'translate(0px, 0px)' },
        ],
        { duration: SHAKE_MS, delay: Math.random() * SHAKE_SPREAD_MS, easing: 'ease-out' },
      );
    }
  }

})();
