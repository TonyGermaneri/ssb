# SSB — Simple Sound Board

An 80s-console soundboard: drop audio files onto the page and each one becomes a pad.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # vitest (knob math, timing, peaks)
npm run build    # typecheck + production build
```

## Using it

- **Drop** mp3/wav/ogg/m4a/flac anywhere (or click **+**). The board, settings and header state save to IndexedDB.
- **SFZ instruments**: drop a folder (or a .zip, or the .sfz together with its samples), or use **+ → Add folder…**.
  See [SFZ](#sfz) below.
- **Click a pad** to play. **☰** (or right-click) opens its control panel above it; ☰ again closes it.
- **Keys** `1–0`, `Q–P`, `A–L`, `Z–M` trigger pads in grid order. **Space** = PANIC, **Esc** = close panels.
- **Knobs**: drag up/down, scroll, arrow keys; **Shift** = fine; **double-click** = reset.
- **Waveform**: drag to move clip in/out. Grains flash on it while they play.

### Per-pad panel

PLAY (vol, pan, repeat, choke) · TUNE (pitch, fine, speed + TAPE/STRETCH) · KEYS (root note, velocity amount,
bend range) · CLIP · ADSR · FILTER (LP/HP/BP) ·
FILTER ADSR · EQ · GRAIN (size, pos, width, density, jitter, reverse, spread) · DELAY · REVERB ·
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
  inheritance, `#define` (shared across includes), `#include` (relative to the main file)
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
- **GM soundfonts** — all 128 General MIDI instruments from
  [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (FluidR3_GM or MusyngKite), one MP3
  every 3 semitones, mapped as an SFZ.
- **Drum banks** — [tidalcycles/Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples) (218 banks); each file
  becomes a pad.
- **URL** — any .sfz (samples fetched next to it), audio file or .zip; GitHub "blob" page links are rewritten to raw.

### Grain streams

GRAIN → **STREAMS** runs up to 8 independent grain streams per note; **SCATTER** randomises each stream's timing and
**DRIFT** gives each its own speed and direction through the clip. The waveform shows every playing grain's playhead.

### Grid mode

The table button in the header's BOARD group switches to a spreadsheet view (canvas-datagrid, loaded on first use).
Click a row to select that patch (its full control panel opens on the right), click **▷** or double-click a read-only
cell to play, double-click an editable cell (name, tag, mode, rpt, vol, pan, pitch, speed, cutoff, choke) to type a
value, and click a column title to sort. Playing rows light up; the grid follows the current theme.

### Themes

Click the **SSB** logo to cycle 13 era/genre themes (Shift-click goes back): Console '85, Diner '55, Surf '62,
Psych '67, Funk '74, Disco '77, Roots '78, Outrun '86, Metal '88, 8-Bit '89, Grunge '93, Vapor '95, Noir '49.

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

OUTPUT + VU · NOW PLAYING · PATCH (◀ selected ▶, PLAY, POLY/MONO, octave, GLIDE) · PERFORM (MOD, spring-loaded BEND, global MATRIX) ·
global CHORUS / DELAY / REVERB · TAGS filter · BOARD (pad SCALE, scanlines, undo, redo, add, MIDI, export, import). Wraps into rows on narrow windows.

- **Select a patch** with the piano button in a pad's lower-right corner, or ◀ ▶ in the header.
- **PLAY** turns MIDI and the computer keyboard into a piano for the selected patch (C4 = original pitch).
  Computer keys: `Z` row = C3 octave, `Q` row = C4 octave, `-` / `=` = octave down/up.
- **MONO** + **GLIDE** = legato portamento; **POLY** = each note its own voice (glide slides from the last note).

See [PLAN.md](PLAN.md) for the design and audio graph.
