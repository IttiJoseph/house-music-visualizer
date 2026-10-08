// ─────────────────────────────────────────────
// JAZZ HOUSE BEAT — one layer per room (9 rooms)
// 30 cycles/min × 4 kicks per cycle = 120 BPM
// ─────────────────────────────────────────────
setcpm(30);

// ── MIXER: fixed volume per room ─────────────
let kickVol   = 1;
let bassVol   = 1;
let snareVol  = 0.7;
let hatsVol   = 0.8;
let grooveVol = 0.7;
let percsVol  = 0.6;
let epianoVol = 0.8;
let pianoVol  = 0.7;
let guitarVol = 0.8;

// ── Shared (house-wide) ──────────────────────
// Chord progression used by the e-piano and piano
let chords = n("<0,2,4,6>").scale("<C3:minor C3:minor E3:minor <D3:minor D3:major>>");

// Guitar reverb + delay amount
let guitarFx = 0.5;


// ── BASEMENT: low end ────────────────────────

// Kick — four on the floor
let kick = s("jazz")
  .struct("[1 0 1 0 1 0 1 0]")
  .room(0.06)
  .gain(.8)
  .postgain(kickVol);

// Bass — pitched sample in C minor
let bass = n("1b").scale("C2:minor").s("jazz:5")
  .struct("1 [0 1] [0 1] 0 0 1 <0 [0 1]> 0")
  .postgain(bassVol);


// ── GROUND FLOOR: rhythm ─────────────────────

// Snare — beats 2 and 4
let snare = s("jazz:7")
  .struct("0 0 1 0 0 0 1 0")
  .room(.4)
  .postgain(snareVol);

// Hats — closed 16ths + offbeat 707 hat
let hats = stack(
  s("hh")                                  // closed hat, accented 16ths
    .struct("[1 1 1 1]*4")
    .delay(.1)
    .gain("[0.05 0.2 0.5 0.2]*4"),
  s("tr707_hh")                            // offbeat hat between the kicks
    .struct("[0 1 0 1 0 1 0 1]")
    .delay(.1).room(.1)
    .gain(0.5),
).postgain(hatsVol);

// Groove perc — euclidean 5 hits over 16 steps
let groove = s("jazz:1")
  .euclidRot(5, 16, 1)
  .gain(0.5)
  .postgain(grooveVol);

// Percs — two-hit accent + euclidean 9/16 pattern
let percs = stack(
  s("jazz:2")                              // two hits per bar
    .struct("1 0 0 0 0 0 1 0"),
  s("jazz:6")                              // 9 hits over 16 steps
    .euclidRot(9, 16, 3)
    .lpf(2000)
    .room(.03)
    .gain(0.4),
).postgain(percsVol);


// ── UPSTAIRS: harmony ────────────────────────

// E-piano — soft ambient chord on every beat
let epiano = chords
  .struct("x*4")
  .s("<gm_epiano2:2,triangle>")
  .attack(.2).release(1.5)
  .delay(.25).room(.6).lpf(900)
  .gain(.6)
  .postgain(epianoVol);

// Piano — plucked chords on the struct rhythm
let piano = chords
  .struct("<[x@2 - x - x@2 -] <[x] [x@2 - x - x@2 -]> [x] [x]>")
  .s("gm_piano")
  .room(.2)
  .gain(.8)
  .postgain(pianoVol);

// Guitar — muted left-hand voicings, filter drifts
let guitar = n("1 <0 3> 3 0 2 1 3 1")
  .chord("<Cm7 Cm7 Cm7 Cm7 Em7 Em7 Dm7 Dm7>")
  .dict("lefthand").voicing()
  .s("gm_electric_guitar_muted")
  .lpf(perlin.range(500, 4000))
  .delay(guitarFx).room(guitarFx)
  .fast(2)
  .postgain(guitarVol);


// ── PLAY ─────────────────────────────────────
// Comment out any line to "turn off" that room
stack(
  kick,
  bass,
  snare,
  hats,
  groove,
  percs,
  epiano,
  piano,
  guitar,
)
