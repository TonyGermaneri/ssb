# SSB — Super Sound Board

An 80s-console sampler, synth and sound board: drop audio files (or SFZ instruments) onto the page and each one
becomes a pad; layer them into patches with VCO slots, a mod matrix, grains and global effects. (It started life as
the *Simple* Sound Board — it outgrew the name, kept the acronym.)

**Play it:** <https://tonygermaneri.github.io/ssb/> (GitHub Pages, deployed from `main`).
**Desktop app / AU / VST3:** tagged releases on GitHub; built from [`native/`](native/README.md), which serves
this same page as the window. The app plays like the browser; the AU / VST3 render with a native engine that
follows the page, so SSB sits on a DAW track.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # vitest (knob math, SFZ, zones, modulation, tags, themes)
npm run build    # typecheck + production build
```

## Using it

- **Drop** mp3/wav/ogg/m4a/flac anywhere (or click **+**). The board, settings and header state save to IndexedDB.
- **SFZ instruments**: drop a folder (or a .zip, or the .sfz together with its samples), or use **+ → Add folder…**.
  See [SFZ](#sfz) below.
- **Click a pad** to play. **☰** (or right-click) opens its control panel above it; ☰ again closes it.
- **Keys** `1–0`, `Q–P`, `A–L`, `Z–M` trigger pads in grid order. **Space** = PANIC, **Esc** = close panels.
- **Knobs**: drag up/down, scroll, arrow keys; **Shift** = fine; **double-click** = reset.
- **Waveform**: drag to move clip in/out. Every playing voice and grain shows on it, in its own colour.

### Sounds and patches

Two catalogs, as tabs under the header, each with card and grid views and its own tag filter:
- **Sounds** — the audio you've loaded (pads). Clicking a pad plays it; the piano button edits it in the rack.
- **Patches** — playable instruments built from up to **3 VCO slots**, each holding a sound (as the patch's own
  copy of its settings, so editing a patch never changes the sound), plus the header knobs (volume, glide, mono/poly,
  MPE + bend range, BPM, chorus / delay / reverb, global mod matrix). Selecting a patch loads those header settings;
  changing them while it's selected saves them into it.

The header **◀ ▶** step through patches (in the Patches tab's filtered order) and the keyboard (PLAY) plays the selected
patch. **♥** marks favourites on sound cards, patch cards, the rack and in the grids (♥ column); **♥ FAV** in the tag
strip shows only those.

**AKWF waves**: all 4,358 of [Adventure Kid's single-cycle waveforms](https://github.com/KristofferKarlAxelEkstrand/AKWF-FREE)
(Kristoffer Ekstrand, CC0) ship with SSB, and on the first load every one becomes a **sound of the board**, in AKWF's own
65 categories: the perfect waves first, then AKWF's other basic shapes, its named sets (AKWF_epiano, AKWF_fmsynth,
AKWF_hvoice, …) and the numbered mixed folders. Each is tagged **akwf** and its category (`akwf_epiano`), so the tag
strip filters by category; it loops while held, with its root note at C2 (each 600-frame cycle plays at the rate that
makes it exactly C2, so the loop is sample-exact), centred on zero (some AKWF cycles sit well off it, which as an
oscillator is only a thump). The waves take no storage of their own: their audio is made from the files that ship with
SSB when a wave is first played or drawn, and the board stores only the settings you've changed. **+ → BROWSE WAVES**
shows each category's waves as outlines: click one to hear it, **+** selects its pad (and puts it back if you deleted
it), **1 / 2 / 3** put it straight into that VCO slot of the patch; ← → step through the waves, ↑ ↓ through the
categories, **PUT BACK** restores the deleted ones of what's shown. `scripts/akwf.mjs` rebuilds `public/akwf` from an
AKWF-FREE checkout.

**Built-in patches**: 127 of them, made of AKWF waves, installed right after the waves and tagged **factory** plus what
they are (bass, lead, pad, keys, pluck, bell, mallet, strings, brass, winds, choir, organ, chip, fx, drone, texture) and
how (vco, fm, ring, grain, sync, cloud, loop, lfo, wheel, velocity, aftertouch, mono, glide, …). There are the classic
VCO workflows — detuned unison, octave and fifth stacks, sub oscillators, PWM by crossfading two pulse widths, FM and
ring modulation between slots, an LFO at audio rate in RATIO mode — and Granulator III on single cycles:
- **grain sync**: GRAIN at half of C2, following the keys, puts two grains in every period of the note, so it plays in
  tune and PITCH moves a formant instead of the note; a PITCH route with an opposite GRAIN route sweeps it (SYNC
  SCREAMER LEAD, VOCODER VAGABOND LEAD, FORMANT SURFER LEAD, TALKBOX BASS);
- **CLOUD** choruses one wave into an ensemble or scatters it (GLACIER SHEET PAD, OCTAVE SHIMMER PAD, WIND CHIMES
  CLOUD); **LOOP** stutters (TAPE STUTTER LOOP, NEBULA DRIFT PAD); grain **FM** rings (GRAIN FM BELLWORKS); **VOID**
  crackles (GEIGER COUNTER FX); SPREAD and SPRAY widen (SUPERSAW FROM ONE).

Most answer the mod wheel (vibrato, a formant, a wobble's rate), velocity and aftertouch. They were played one note at a
time in the page, measured (K-weighted loudness, BS.1770) and level-matched to about −16 LUFS with peaks under −4 dBFS
(`src/lib/factoryLevels.ts`). Once installed they're ordinary patches: edit, rename or delete them. **+ → RESTORE
BUILT-INS** puts back any AKWF wave or built-in patch you've deleted. A board from 0.5 keeps its nine factory patches as
they are, under their new names (POLY SAW is SUPERSAW SUNRISE, FM PIANO is TINE MACHINE EP, …), and gains the rest;
boards from before the AKWF waves first lose the old generated SAW WAVE … NOISE sounds, their patches moving to the
AKWF waves.

### VCO slots + rack

The **rack** under the header shows the selected patch's three slots side by side, each with its sound's full panel.
- **Fill a slot** by dragging a sound card by its ⋮⋮ grip into it, or pressing **1 / 2 / 3** on the card (the number
  lights while the sound sits in that slot; the previous sound is replaced). With no patch selected this starts one.
- **REMOVE** empties a slot.
- **VCO 1** is the main voice. VCOs 2–3 have **MIX / MOD** (heard, or a silent modulator only), **TRACK / FIXED**
  (follow the played key keeping TRANS / FINE, or always play NOTE) and **LEVEL**.
- The header's **layout** button cycles rack + list → rack only → list only. Beside the rack the list starts at a
  third of the window; drag the divider to resize it (double-click = 33%).
- Each panel section has a **fold** triangle (top right) that shrinks it to its title. EQ, DELAY and REVERB start
  folded; folds are shared by every panel and saved.

Each VCO's live signal (after its own envelope and filter) is a mod-matrix source (**VCO 1–3** = slots 1–3): route
VCO 2 → pitch for FM, → volume for AM, → cutoff for audio-rate filter sweeps. VCOs are full sounds, so SFZ instruments
and grain clouds work as oscillators too. Note-offs, STOP, choke and PANIC treat the patch as one group.

### Starting up

Every launch starts as a **soundboard**: the pads as cards, the VCO rack put away (the header's
layout button brings it back).

### Tags

A pad's TAGS field holds comma-separated tags (chips in the panel). The **tag strip** under the header lists every tag
with how many pads carry it; click tags to filter (AND) — the strip then shows only tags that co-occur with the
selection, with counts for the remaining pads. **Right-click** a tag to hide everything carrying it instead (the
chip turns red and struck through, counting what it hides; click it again to bring them back). **ALL** clears both. Imports are tagged automatically with where
they came from: `dropped, <folder>`, `sfzinstruments, <repo>`, `gm, <set>, <family>`, `dirt-samples, <bank>`,
`url, <host>`, or `imported, <board>` — plus `sfz` or `sample`.

### Big boards

The card view is virtualised (Vuetify `v-virtual-scroll` over rows sized to the window and pad scale), so only the
rows on screen exist in the DOM; grid mode (canvas-datagrid) handles very large lists natively.

With every AKWF wave on it a board has some 4,400 sounds, so nothing walks all of them on an edit. Each sound and patch
sits under a small proxy of its own (`src/lib/tracked.ts`) that reports writes anywhere inside it: a knob turn marks
that one sound changed, and saving and undo re-serialise only what changed (undo's snapshots share every unchanged
sound's JSON). In the AU / VST3 the native engine holds only the sounds it may be asked to play — what the keyboard
plays, the pads MIDI notes reach, and what was clicked lately, with the VCOs each layers — so a sync, and the DAW
session, stay small; clicking a sound the engine hasn't got waits for it to arrive.

### Per-pad panel

PLAY (vol, pan, level by key, repeat, choke) · TUNE (pitch, fine, speed + TAPE/STRETCH) · KEYS (root note, velocity
amount, bend range) · CLIP · ADSR (+ key scaling) · FILTER (LP/HP/BP, and Granulator III's nine types with
WIDTH; key tracking) · FILTER ADSR (+ key scaling) · EQ · GRAIN (Granulator II: grain rate and key tracking, pos, spray, scan, window, spread, random pitch / rate, flux / void, FM;
Granulator III: CLASSIC / LOOP / CLOUD modes, skew, density, reverse, variation, detune, per-note random pitch) · DELAY · REVERB ·
MODE (STOP / RESTART / STACK / HOLD) · MIDI LEARN · MATRIX · PRESETS (save / load / copy / paste) · RESET ·
duplicate · delete.

- **RPT**: `1` = once, `N` = N times, `0` = loop forever.
- **TAPE**: pitch and speed both change playback rate, like a sampler. **STRETCH**: granular; speed changes length, pitch stays put.
- STOP re-press, HOLD release and MIDI note-off run the ADSR release and let FX tails ring. PANIC / choke / RESTART cut instantly.
- **K>VOL**: level by key, dB an octave from ROOT (±3). **KEY** on the ADSR and the FILTER ADSR: higher notes run them
  faster (at 100 %, twice as fast an octave up), as Granulator III's Key > Env.
- **FILTER**'s type menu has SSB's LP / HP / BP (Web Audio's biquads) and **Granulator III's filter**: two 12 dB
  state-variable stages, as LP 12, LP 24, LP+HP, LP+NO, NOTCH, NO+NO, HP+NO, HP 12 and HP 24. **WIDTH** puts the second
  stage that many semitones from the first (LP+HP, LP+NO, NO+NO, HP+NO); its NOTCH is Granulator III's own, a true notch
  at RES 1 that takes the lows down a little below that and turns into a resonant bump above it. Its left and right
  sides follow an LFO's STEREO apart. **KEY**: the cutoff follows the note from ROOT (100 %: an octave an octave).

### Modulation matrix

Sources: LFO 1, LFO 2, MOD WHEEL (CC1), AFTERTOUCH (poly + channel pressure), VELOCITY, KEY (octaves from the pad's
ROOT, so KEY → PITCH at 100 % adds an octave per octave), RANDOM (−1…1, drawn for each note), PITCH BEND, TIMBRE (CC74),
FILTER ENV (the pad's filter ADSR, 0–1, whatever its AMOUNT: a second envelope), VCO 1–3.
Destinations: pitch, cutoff, resonance, volume, pan, grain pos, grain size, skew / xfade, variation, detune, scan speed
(× 1 + the route: up to three times as fast, and backwards below −100 %), the pad's LFO 1 / 2 RATE (±36 semitones) and
AMOUNT (added to its AMOUNT knob; a pad matrix only — an LFO doesn't drive itself, and two LFOs only one way),
delay mix, reverb mix.
The **GLOBAL** matrix (header MATRIX button) applies to every sound and its LFOs run freely; each pad's matrix
(panel MATRIX button) applies to that pad and its LFOs restart per note. Pitch bend always bends pitch by the
pad's BEND range. Negative volume modulation from an LFO is a tremolo that never boosts.

### Tempo, sync, sustain

LFOs can **SYNC** to note divisions (4 bars … 1/32, dotted, triplets) and the global delay has a **SYNC** switch.
Tempo comes from the **BPM** knob (INT) or incoming **MIDI clock** (EXT); MIDI Start restarts the global LFOs.
LFO shapes: sine, triangle, square, saw up, saw down, sample & hold, smooth random, and Granulator III's **RAND**
(random steps four times a cycle, glided). **SUS** / MIDI CC64 is a sustain pedal for keyboard play and HOLD pads.

Granulator III's LFO additions: **HZ / SYNC / RATIO** (RATIO runs it at a multiple of the note's frequency, from
middle C at the pad's ROOT; it is audio rate, so try it on GRAIN POS or the cutoff), **AMOUNT**, **STEREO** (0–180°
between its left and right: the grains' and Granulator III's filter's two sides each follow their own), **QUANT**
(steps), and, for a pad's LFOs, the **PHASE** each note starts them at (0° / 90° / 180°, or FREE).

**HLD** (header, by POLY / MONO) is Granulator III's latch for keyboard play: released keys keep sounding; the next
note played with no key down lets the latched ones go, and notes added while keys are down join them.

### MIDI pad mapping

**LRN**: each pad's learned note (LEARN in its panel). **AUTO**: notes map to pads in grid order starting at **BASE**
(default C2 = 36, the usual drum-pad start).

### SFZ

An .sfz file becomes one instrument pad (marked **SFZ**) whose zones map key × velocity ranges to samples. Clicking
the pad plays its ROOT note; with the pad selected, **PLAY** mode (MIDI or computer keys) picks zones per note, pitched
from each region's key centre. MIDI-triggered pads pass velocity through, so velocity layers work there too.
The panel shows a zone map (keys across, velocity up) that lights as notes sound.

Supported:
- structure: `<control>` (default_path, note_offset, octave_offset, set_ccN, set_hdccN), `<global>/<master>/<group>/<region>`
  inheritance, `#define` (shared across includes), `#include` (relative to the main file) — anywhere on a line, in
  reading order (a macro can be redefined per region, and include paths can use macros); `../` paths above the .sfz
- mapping: sample, key / lokey / hikey, lovel / hivel, locc / hicc, pitch_keycenter, pitch_keytrack, transpose, tune,
  seq_length / seq_position (round robin), lorand / hirand, sw_last / sw_default (default articulation)
- playback: volume, amplitude, pan, offset, end, loop_mode, loop_start / loop_end, ampeg_attack / hold / decay /
  sustain / release, trigger=release with rt_decay
- generators: `*sine`, `*saw`, `*square`, `*triangle`, `*noise`, `*silence` (band-limited looped wavetables)
- CC opcodes: volume / amplitude / pan / pitch / tune / cutoff / resonance `_onccN` (live), locc / hicc gating
- filter: fil_type, cutoff, resonance, fil_keytrack, fil_keycenter, fil_veltrack, fileg_* (the region's filter
  replaces the pad's)
- LFOs: v1 amplfo_ / pitchlfo_ / fillfo_ (freq, depth, delay) and v2 lfoN_ (freq, wave, delay → pitch, cutoff,
  volume, amplitude, pan)

Sample offsets are converted using each file's own sample rate (read from WAV / FLAC / Ogg headers). Not supported
yet: pitch EG, keyswitching while playing, CC-driven EG / LFO parameters, effects busses.

A .zip containing `board.json` still imports as a board; any other .zip is unpacked like a dropped folder.

### Library

**+ → Browse library…** fetches free, CORS-enabled collections straight into the board (no download step):
- **SFZ instruments** — the [sfzinstruments](https://github.com/sfzinstruments) GitHub org (70+ instruments). Pick an
  instrument, then one of its .sfz files; only the samples that .sfz uses are fetched (the size is shown first).
  Samples an .sfz names wrongly (case, a missing default_path) are found in the repo by their path's tail.
- **GM soundfonts** — all 128 General MIDI instruments from
  [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (FluidR3_GM or MusyngKite), one MP3
  every 3 semitones, mapped as an SFZ.
- **Drum banks** — [tidalcycles/Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples) (218 banks); each file
  becomes a pad.
- **URL** — any .sfz (samples fetched next to it), audio file or .zip; GitHub "blob" page links are rewritten to raw.

### Grain clouds

GRAIN's **ON** switch plays the pad as a cloud of grains, with the engine of Robert Henke's **Granulator II**
(Max for Live), ported from its voice patch. Each note runs two grain streams, left and right, each a phasor at the
**GRAIN** frequency (0.25–150 Hz): a grain starts every time it wraps and another half a period later, and each lasts
one whole period, so two always overlap and the window is a sine (the square root of a Hann). GRAIN follows the
keyboard (**G<KEY**, from the pad's ROOT) and so does the sample's pitch (**T<KEY**): low GRAIN is a slow, smooth
cloud; high GRAIN is a buzz that plays in tune with the keys. With T<KEY at 0 the note only moves the buzz, so the
sample's tone stays put like a formant.

- **POS** where the grains read; **P<KEY** moves it 1 % of the clip per semitone. **SPRAY** offsets each grain by up
  to that many ms (SYM, or only RIGHT / LEFT of POS), **SLOPE** keeps most offsets near POS.
- **SCAN** (switch): from each note, POS travels **S.DIST** of the clip, **S.TIME** 100 % at real time (200 % half
  speed), along **CURVE**, then stays.
- **SHAPE** steepens the window's edges up to a square half a period wide; STD / FALL / RISE / NOIZ picks the whole
  sine, its falling or rising half, or noise.
- **SPREAD** pulls the left and right grain rates apart (up to two octaves), **G<RND** lets GRAIN wander up to
  ±25 semitones, **T<RND** gives each grain its own pitch.
- **FLUX** gives each grain a random level; **VOID** drops a share of them, keeping **RESID** of their level.
- **FM** (switch) swings where the grains read with a sine at **FM HZ** (following the keys by **FM<KEY**), by up to
  ± **FM AMT** × 0.02 ms.

**MODE** adds the engines of Robert Henke's **Granulator III**. **CLASSIC** is Granulator II's, as above. **LOOP** plays
a segment one grain long, then the next from wherever POS (with SCAN, SPRAY and VARIATION) has got to: **XFADE**
crossfades each into the next (0 cuts hard), **REVERSE** is the chance a segment plays backwards. **CLOUD** layers
**DENSITY** grains a side (2–20, fixed when the note starts), the i-th 1 + √i grains long, so they start staggered and
drift apart; CLOUD sums its grains, so more of them is louder.

- **SKEW** leans CLASSIC's window: below 50 % a grain peaks at once and dies away, above it swells to an abrupt end.
- **VARIATION** scales four random amounts, drawn per grain: **V.POS** starts it up to that many ms later (× VARIATION²),
  **V.SIZE** changes its length by up to ± that many semitones, **V.PITCH** its pitch (CLOUD only), **V.VOL** its level
  (from 1.75 × that many dB quieter to a quarter of it louder).
- **DETUNE** pitches the left grains down and the right ones up; **N<RND** gives each note its own random pitch.
- **S.LOOP** starts SCAN over at S.DIST instead of stopping; **S.KEY** makes it faster for higher notes (an octave up,
  twice as fast).

Everything random is off to start with, as in Granulator II: SPRAY and the random amounts are what turn short grains
into noise. The mod matrix reaches GRAIN POS and GRAIN (in semitones, like Granulator II's Grain<LFO), and SKEW / XFADE,
VARIATION and DETUNE (Granulator III's SHAPE, VARIATION and SPREAD targets), each read as a grain starts. Grains
render sample by sample, an AudioWorklet in the page and the same code in the plugin's engine.

The waveform follows what you hear (the output's timestamp, not the scheduler's clock) and shows every playing
instance in its own colour (hue by note, brightness by velocity) with a label: a playhead for tape / stretch / SFZ
voices, and for clouds each grain over the part of the sample it plays, at its pan (left up, right down), as tall as
it is loud, hue-shifted by its pitch, notched when reversed, fading out after it ends.

Its **2D / ISO** switch (top right; the header's VCO scopes follow it) turns it **isometric**: the wave stands as a wall
on a floor — a stereo sample's left at the back and its right at the front — the clip and the grain lie on the floor,
grains stand where they play at their side's depth, and the playhead is a lit curtain across it. In either view, with
GRAIN on, dragging edits the grain: the highlight is the stretch one grain plays from POS; drag its middle to move
POS, its sides to set its length (GRAIN), or anywhere else to put it there. Shift-drag moves the clip (in 2D the clip
markers' flags along the top still grab them too).

### Grid mode

The table button in the header's BOARD group switches to a spreadsheet view (canvas-datagrid, loaded on first use).
Click a row to select that patch (its full control panel opens on the right), click **▷** or double-click a read-only
cell to play, double-click an editable cell (name, tag, mode, rpt, vol, pan, pitch, speed, cutoff, choke) to type a
value, and click a column title to sort. Playing rows light up; the grid follows the current theme.

### Themes

Click the **SSB** logo for the theme picker: 68 themes in five groups, each tile with its swatches. Hover a tile to
preview it on the whole board, click to keep it; ◀ ▶ at the top step through them in order.
- **ERAS** — Noir '49, Diner '55, Surf '62, Psych '67, Avocado '72, Funk '74, LED Calc '76, Disco '77, Punk '77,
  Roots '78, Cassette '79, Laserium '83, Console '85, Outrun '86, Mall '87, Metal '88, Boombox '88, 8-Bit '89,
  Rave '92, Grunge '93, Vapor '95
- **GAMES** — Invaders '78, Vector '79, Pac-Maze '80, Arcade '81, Plumber '85, Legend '86, Pocket '89, Hedgehog '91,
  Fighter '91, 16-Bit '91, Hellfire '93, Island '93, Red Visor '95
- **COMPUTERS** — Woodgrain '77, Phosphor '78, CGA '81, Breadbin '82, Rubber Keys '82, Platinum '84, Workbench '85,
  Commander '86, Desktop '95, Bondi '98
- **MOVIES** — Galaxy '77, Nostromo '79, Replicant '82, Grid '82, Norad '83, Slimer '84, Cyborg '84, Flux '85,
  Neo-Tokyo '88, Afterlife '88, Dino Park '93, Code '99
- **TV** — Test Card '75, VJ '81, Knight '82, The Van '83, Vice '84, LCARS '87, Headroom '87, Bayside '89, Peaks '90,
  Splat '91, Gotham '92, Unexplained '93

### MPE

Turn on **MPE** (header PATCH group, or the matrix modal) for MPE controllers (lower zone). Channel 1 is the master
channel: its bend, pressure, mod wheel and CC74 apply to every voice. Notes on channels 2–16 each get their own pitch
bend (range set by NOTE BEND, default ±48), pressure (→ AFTERTOUCH) and CC74 (→ TIMBRE), including values sent just
before the note starts. MPE is always polyphonic.

### Undo / presets

**⌘Z / ⇧⌘Z** (or the header buttons) undo pad and sound-shaping edits; a knob drag is one step, and deleted pads
come back. **PRESETS** in a pad's panel save its settings to a library shared by all pads (skipping name, tag,
clip, root and MIDI note); COPY / PASTE moves settings between pads directly. Presets are saved with the board and
included in exports.

### Header

OUTPUT + vertical VU · PATCH (◀ selected ▶, PLAY, POLY/MONO, HLD, octave, GLIDE) · PERFORM (MOD, spring-loaded BEND, global MATRIX) ·
global CHORUS / DELAY / REVERB · TAGS filter · BOARD (pad SCALE, scanlines, undo, redo, add, MIDI, export, import). Wraps into rows on narrow windows.

- **Select a patch** in the Patches tab, or with ◀ ▶ in the header.
- **PLAY** turns MIDI and the computer keyboard into a piano for the selected patch (C4 = original pitch).
  Computer keys: `Z` row = C3 octave, `Q` row = C4 octave, `-` / `=` = octave down/up.
- **MONO** + **GLIDE** = legato portamento; **POLY** = each note its own voice (glide slides from the last note).

See [PLAN.md](PLAN.md) for the design and audio graph.

## License

[MIT](LICENSE). The desktop app and plugins are built with [JUCE](https://juce.com), which has its own license
terms for distributed binaries. The AKWF waveforms in `public/akwf` are Kristoffer Ekstrand's, dedicated to the public
domain under [CC0 1.0](public/akwf/LICENSE.md).
