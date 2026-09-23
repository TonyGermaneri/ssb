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

Sources: LFO 1, LFO 2, MOD WHEEL (CC1), AFTERTOUCH (poly + channel pressure), VELOCITY, PITCH BEND.
Destinations: pitch, cutoff, resonance, volume, pan, grain pos, grain size, delay mix, reverb mix.
The **GLOBAL** matrix (header MATRIX button) applies to every sound and its LFOs run freely; each pad's matrix
(panel MATRIX button) applies to that pad and its LFOs restart per note. Pitch bend always bends pitch by the
pad's BEND range. Negative volume modulation from an LFO is a tremolo that never boosts.

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
