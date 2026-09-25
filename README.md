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

**Factory patches** built on the built-in synth waves (saw, square, sine, triangle, noise) are installed on a new board:
POLY SAW, PURE SINE, FM PIANO, SQUARE LEAD, WARM PAD, SUB BASS, BRASS STAB, WIND, RING BELL. **+ → ADD FACTORY
PATCHES** adds them again.

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

### Per-pad panel

PLAY (vol, pan, repeat, choke) · TUNE (pitch, fine, speed + TAPE/STRETCH) · KEYS (root note, velocity amount,
bend range) · CLIP · ADSR · FILTER (LP/HP/BP) ·
FILTER ADSR · EQ · GRAIN (on/off, size, rate, pos, spray, shape, scatter, jitter, reverse, spread, streams, drift) · DELAY · REVERB ·
MODE (STOP / RESTART / STACK / HOLD) · MIDI LEARN · MATRIX · PRESETS (save / load / copy / paste) · RESET ·
duplicate · delete.

- **RPT**: `1` = once, `N` = N times, `0` = loop forever.
- **TAPE**: pitch and speed both change playback rate, like a sampler. **STRETCH**: granular; speed changes length, pitch stays put.
- STOP re-press, HOLD release and MIDI note-off run the ADSR release and let FX tails ring. PANIC / choke / RESTART cut instantly.

### Modulation matrix

Sources: LFO 1, LFO 2, MOD WHEEL (CC1), AFTERTOUCH (poly + channel pressure), VELOCITY, PITCH BEND, TIMBRE (CC74).
Destinations: pitch, cutoff, resonance, volume, pan, grain pos, grain size, delay mix, reverb mix.
The **GLOBAL** matrix (header MATRIX button) applies to every sound and its LFOs run freely; each pad's matrix
(panel MATRIX button) applies to that pad and its LFOs restart per note. Pitch bend always bends pitch by the
pad's BEND range. Negative volume modulation from an LFO is a tremolo that never boosts.

### Tempo, sync, sustain

LFOs can **SYNC** to note divisions (4 bars … 1/32, dotted, triplets) and the global delay has a **SYNC** switch.
Tempo comes from the **BPM** knob (INT) or incoming **MIDI clock** (EXT); MIDI Start restarts the global LFOs.
LFO shapes: sine, triangle, square, saw up, saw down, sample & hold, smooth random. **SUS** / MIDI CC64 is a
sustain pedal for keyboard play and HOLD pads.

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

GRAIN's **ON** switch plays the pad as a cloud of grains, the way asynchronous granular synthesis does it (Truax,
Roads, Mutable Instruments Clouds): **RATE** is grains per second, independent of **SIZE**, so a cloud can be sparse
(clicks and gaps) or dense (a smear); **SCATTER** moves their start times from a steady clock (0) to random, Poisson
times (1) at the same average rate; **SPRAY** scatters where in the sample each grain reads, around **POS**; **SHAPE**
runs each grain's window from square (harsh) to Hann (smooth). SIZE goes from a single sample (the first 15 % of the
knob, shown in samples) through 5–500 ms (most of the travel, the middle is ~50 ms) to the whole sample. JITTER
detunes each grain, REV plays some backwards, SPREAD pans them, **STREAMS** runs up to 8 independent streams per note
and **DRIFT** sends each wandering through the clip. Grains render sample by sample (an AudioWorklet in the page, the
same code in the plugin's engine), so hundreds a second are cheap.

The waveform follows what you hear (the output's timestamp, not the scheduler's clock) and shows every playing
instance in its own colour (hue by note, brightness by velocity) with a label: a playhead for tape / stretch / SFZ
voices, and for clouds each grain over the part of the sample it plays, at its pan (left up, right down), as tall as
it is loud, hue-shifted by its pitch, notched when reversed, fading out after it ends.

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

OUTPUT + vertical VU · PATCH (◀ selected ▶, PLAY, POLY/MONO, octave, GLIDE) · PERFORM (MOD, spring-loaded BEND, global MATRIX) ·
global CHORUS / DELAY / REVERB · TAGS filter · BOARD (pad SCALE, scanlines, undo, redo, add, MIDI, export, import). Wraps into rows on narrow windows.

- **Select a patch** in the Patches tab, or with ◀ ▶ in the header.
- **PLAY** turns MIDI and the computer keyboard into a piano for the selected patch (C4 = original pitch).
  Computer keys: `Z` row = C3 octave, `Q` row = C4 octave, `-` / `=` = octave down/up.
- **MONO** + **GLIDE** = legato portamento; **POLY** = each note its own voice (glide slides from the last note).

See [PLAN.md](PLAN.md) for the design and audio graph.

## License

[MIT](LICENSE). The desktop app and plugins are built with [JUCE](https://juce.com), which has its own license
terms for distributed binaries.
