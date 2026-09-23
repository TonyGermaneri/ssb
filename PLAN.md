# SSB — Simple Sound Board: Implementation Plan

## 1. Stack

| Concern | Choice |
|---|---|
| Build | Vite |
| Framework | Vue 3 (`<script setup>`, TypeScript) |
| UI kit | Vuetify 4 (`vite-plugin-vuetify` auto-import), custom dark "console" theme |
| State | Pinia |
| Audio | Web Audio API only (no audio libs) |
| Persistence | IndexedDB via `idb-keyval`: audio blobs + per-sound settings, so the board survives a reload |
| Tests | Vitest for pure logic (param mapping, repeat scheduling math, peak extraction) |

Scaffold: hand-written Vite config, plus `vuetify`, `vite-plugin-vuetify`, `@mdi/font`, `pinia`, `idb-keyval`, `jszip` (lazy-loaded), `vitest`.

## 2. Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [VOL ◔] [MUTE] [PANIC!]  ▸ NOW PLAYING: airhorn · rimshot · sad-trombone │  ← master strip (thin)
├──────────────────────────────────────────────────────────────────────────┤
│                    ┌────────────── panel ─────────────┐                  │
│                    │ ~waveform~  name[____] tag[____] │                  │
│                    │ VOL RPT  CUT RES  IN OUT          │                  │
│                    │ G.SIZE G.POS G.WID                │                  │
│                    │ DLY: TIME FDBK MIX                │                  │
│                    │ REV: SIZE DECAY MIX               │                  │
│                    │ EQ:  BASS MID TREB                │                  │
│                    └───────────────────────────────────┘                  │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                           │
│  │≡ AIRHRN│  │≡ RIMSHT│  │≡ TROMBN│  │≡ BOING │   ← button grid           │
│  └────────┘  └────────┘  └────────┘  └────────┘                           │
│                 (drop .mp3 files anywhere)                               │
└──────────────────────────────────────────────────────────────────────────┘
```

- Grid is a flex-wrap with `align-items: flex-end`, so when a tile's panel opens it grows **upward** and the buttons in that row stay aligned. Multiple panels may be open at once; with none open it's a plain button grid.
- Panel is rendered inside the tile (not a floating `v-menu`), so several can be open and they don't fight over overlay z-order.

## 3. Components

```
src/
  main.ts                 Vuetify + Pinia setup, theme
  App.vue                 MasterStrip + DropZone + SoundGrid
  audio/
    engine.ts             AudioContext singleton, master bus, panic(), analyser
    voice.ts              one playing instance: builds the node chain, handles repeat/loop, granular scheduler
    impulse.ts            generated reverb impulse responses (noise × exp decay), cached by size/decay
    peaks.ts              AudioBuffer → N min/max peaks for the waveform
  stores/
    board.ts              Pinia: sounds[], trigger modes, choke, open panels, persistence, import/export, MIDI
  components/
    MasterStrip.vue       volume knob, mute, PANIC, now-playing marquee (+ VU meter)
    SoundGrid.vue         flex grid of SoundTiles
    SoundTile.vue         panel (v-if open) + SoundButton
    SoundButton.vue       the arcade button, hamburger, playing LED/progress
    ControlPanel.vue      all per-sound controls, grouped
    Knob.vue              pot-style knob built on v-progress-circular
    Waveform.vue          canvas waveform with clip in/out + grain position overlay
    DropZone.vue          window-level drag/drop overlay
  theme/console.css       fonts, bevels, scanlines, LED glow
```

## 4. Knob component (`Knob.vue`)

- Built on `v-progress-circular` with `rotate="225"` and value scaled to 75% so it draws a 270° pot arc (7 o'clock → 5 o'clock), with an indicator notch rotated to match.
- Props: `modelValue`, `min`, `max`, `default`, `step`, `curve: 'lin' | 'log'`, `label`, `format` (for the readout, e.g. `1.2k Hz`, `-6 dB`, `∞`).
- Interaction: vertical pointer drag (pointer capture; Shift = fine), mouse wheel, double-click resets to default, arrow keys when focused. Small LED-style value readout under the knob.
- Bipolar knobs (EQ) draw the arc from 12 o'clock.

## 5. Per-sound controls → audio mapping

| Control | Range / default | Implementation |
|---|---|---|
| Volume | 0–1.5, 1 | `GainNode` |
| Repeat count | 0 … 16, default 1 (plays once); 0 = loop forever | `source.loop = true` with `loopStart/loopEnd` = clip in/out; `stop(t0 + n × clipLen)` for finite n (sample-accurate, no `onended` chaining) |
| Freq cutoff | 20 Hz–20 kHz log, 20 k | `BiquadFilterNode` lowpass `.frequency` |
| Resonance | Q 0.1–20, 0.7 | same filter `.Q` |
| Clip in / out | 0–100% of duration, in < out enforced | `start(0, in)` + loop points; shown on waveform |
| Grain size | 0 = off, 10–500 ms | granular mode (see §6) |
| Grain position | 0–100% within clip | granular center point |
| Grain width | 0–100% of clip | random ± spread around position per grain |
| Delay ×3 | time 0–2 s, feedback 0–0.9, mix 0–1 | `DelayNode` + feedback `GainNode` loop + wet/dry gains |
| Reverb ×3 | size 0.1–6 s, decay 1–10, mix 0–1 | `ConvolverNode`, impulse regenerated (debounced) on size/decay change |
| EQ ×3 | ±12 dB | `lowshelf` 120 Hz, `peaking` 1 kHz, `highshelf` 8 kHz |
| Waveform | — | canvas from cached peaks; click/drag to set clip in/out (nice-to-have) |
| Name / Tag | text | `v-text-field` density compact; name defaults to filename sans `.mp3` |

Signal chain per voice:

```
source(s) → filter → EQ low → EQ mid → EQ high ─┬─ dry ──────────────┐
                                                ├─ delay (fb loop) ──┤→ voice gain → master gain → analyser → destination
                                                └─ reverb ───────────┘
```

All knob changes apply live to playing voices via `setTargetAtTime` (no zipper noise).

## 6. Granular mode

- Grain size 0 → normal sample playback.
- Grain position stays where the knob puts it (no sweep); width adds random jitter around it.
- Grain size > 0 → a lookahead scheduler (`setInterval` 25 ms, schedules 100 ms ahead) fires grains every `size / 2` (2× overlap). Each grain is an `AudioBufferSourceNode.start(when, offset, size)` through a Hann-shaped gain envelope, where `offset = position ± random(width/2)`, clamped to the clip region.
- Duration in granular mode = clip length × repeat count (∞ for 0), so repeat means the same thing in both modes.
- Grains feed the same filter/EQ/FX chain as normal playback.

## 7. Button & hamburger behavior

- Press the pad → play. What a press does *while the sound is already playing* is set per sound by a cycling **MODE** button in its panel (LED dots show which):
  - **STOP** (default): press again to stop — how you stop a looping (`0`) sound without PANIC.
  - **RESTART**: stop and start again from the clip-in point.
  - **STACK**: layer another copy on top.
  - **HOLD**: plays only while the pad / key / MIDI note is held down.
- Hamburger icon in the button's top-left corner: `@click.stop`, plus `@pointerdown.stop` / `@mousedown.stop` so the button's ripple and press animation don't fire either. It toggles `openPanels[id]`.
- Button shows: name, tag chip, an LED ring/glow while playing, and a thin progress bar along the bottom edge.
- Right-click on a pad also toggles its panel. Delete is in the panel, with an inline DELETE? confirm (no browser dialog).

## 8. Master strip

- Master volume knob (master `GainNode`).
- MUTE toggle (lit red when muted; ramps master gain to 0, remembers level).
- PANIC!: stops every voice, clears granular schedulers, and fades each voice's own output (every voice has its own delay/reverb) so nothing keeps ringing.
- Now-playing: LED-matrix-style scrolling marquee of the names of active voices.
- Stereo VU meter from the master `AnalyserNode`.

## 9. Drag & drop

- Window-level `dragenter/dragover/drop` listeners; a full-screen "DROP TO LOAD" overlay appears while dragging.
- Accept `audio/mpeg` (`.mp3`); also accept wav/ogg/m4a, since `decodeAudioData` handles them for free.
- Per file: store the blob in IndexedDB → `decodeAudioData` → compute peaks → add tile. Multi-file drops are supported; decode errors show a snackbar.

## 10. 80s console look

- Theme: charcoal/brushed-metal panels, beveled edges (inset/outset box-shadows), wood-grain end caps on the master strip.
- Palette: amber `#ffb000` and phosphor green `#33ff66` LEDs, hot pink/cyan accents on buttons. Every Vuetify color is a theme token.
- Fonts (Google Fonts): `VT323` for readouts and the marquee, `Orbitron` for labels.
- Buttons: chunky arcade-style square pads with a glossy convex gradient, colored by tag, press-down translate + inner shadow, glow when playing.
- Subtle CRT scanline overlay (`repeating-linear-gradient`, `pointer-events: none`), toggleable.
- Knob arcs in LED amber on a dark track, with small silkscreened labels under each knob.

## 11. Extras (all included)

1. **Persistence** (IndexedDB), already in the plan above; without it, every reload wipes the board.
2. **Keyboard triggers**: map keys 1–0 / Q–P / A–L… to buttons in grid order and print the key on the button. Space = panic.
3. **Tag filter** in the master strip: chips for each tag; click to filter the grid.
4. **Delete / duplicate** a sound (duplicate = same audio, different settings).
5. Pan knob, pitch/playback-rate knob, fade in/out.
6. Choke groups (sounds in the same group cut each other off).
7. Drag to reorder tiles.
8. Export/import the whole board (zip of audio + JSON settings).
9. Web MIDI: learn a pad or note per button.

## 12. Build order

1. Scaffold Vite/Vue/Vuetify/Pinia, theme, fonts; `git init` and first commit.
2. `engine.ts` + store + drag/drop + plain buttons that play → end-to-end sound.
3. `Knob.vue` (with Vitest tests for value↔angle mapping and log curve).
4. Master strip: volume, mute, panic, now-playing.
5. Tile panel + hamburger toggle + volume/repeat/clip/filter/EQ.
6. Delay + reverb.
7. Granular scheduler.
8. Waveform canvas + clip markers.
9. IndexedDB persistence.
10. 80s styling pass, then extras (keyboard, tag filter).

## 13. Decisions

- Re-press behavior: per-sound cycling mode — STOP / RESTART / STACK / HOLD (§7).
- Repeat = total plays: `1` = once (default), `N` = N times, `0` = loop forever.
- Grain position stays where the knob sets it.
- Delay / reverb tails ring out after a sound ends naturally; a manual stop, HOLD release, choke, or PANIC cuts them.

## 14. Round 2 — it's a synth now

Added: per-pad RESET; grain markers on the waveform; header SCALE knob (persisted); hamburger centering fix
(browser default button padding pushed the icon 4px right); grain DENSITY / JITTER / REVERSE / SPREAD; amp ADSR
(replaces fades; old boards migrate); filter ADSR (modulates `BiquadFilter.detune`, so it never fights the cutoff
knob) and LP/HP/BP; TUNE module with FINE, SPEED and TAPE/STRETCH; selected patch + ◀ ▶; keyboard PLAY mode
(polyphonic, MIDI + computer keys, velocity); MONO legato; GLIDE; global CHORUS / DELAY / REVERB on the master bus.

Voice kinds: `sample` (one looping source, tape rate), `stretch` (grains walking the clip at SPEED, played at
PITCH), `cloud` (grains around GRAIN POS). Grain gain is normalised by overlap (2 / density).

## 15. Round 3 — modulation, undo, presets

- Mod matrix: 6 sources × 9 destinations, global scope (free-running LFOs on the engine) and pad scope (per-voice
  LFOs, retriggered). Audio-rate routes are `source → GainNode(amount) → AudioParam`: pitch via a per-voice
  pitch bus fanned into every source's `detune`, cutoff via `filter.detune` (sums with the filter envelope),
  volume via a tremolo gain. Grain pos/size are evaluated in JS when each grain is scheduled (`lfoValue` mirrors
  OscillatorNode's waveforms). Changing an amount retargets gains; changing the route set rewires.
- Per-voice ConstantSources for aftertouch, bend and velocity (MPE-ready); one engine ConstantSource for the mod wheel.
- MIDI parsed to events (note, poly/channel pressure, bend, CC). Root note, velocity amount and bend range per pad.
- Undo: JSON snapshots (pads + fx + global matrix + glide/mono), coalesced 400 ms, restored in place so playing
  voices follow. Deleted pads keep their audio until the next load's orphan sweep, so undo can restore them.
- Presets: library stored with the board; COPY / PASTE clipboard.

## 16. MPE

Lower zone. Voices carry their MIDI channel; per-voice ConstantSources for note bend (→ pitch bus, scaled by the
MPE bend range) and timbre (CC74, new matrix source) join the existing pressure source. The store keeps the latest
bend / pressure / timbre per member channel so a note starts where its channel already is, keys poly voices by
`channel:note`, and routes master-channel controllers to the global performance values.

## 17. Round 4 — themes, sync, sustain, pads

- Themes: colours are CSS variables on :root (`src/theme/themes.ts`), mirrored as Vuetify themes; pads take hue
  palette, saturation and lightness from the theme. Hardware buttons and knob caps stay dark in every theme.
- LfoSource: one output GainNode; periodic shapes via OscillatorNode (saw-down = inverted saw), random shapes via a
  scheduled ConstantSourceNode (S&H steps / smooth ramps) with a JS mirror (`valueAt`) for grain destinations.
- Tempo: internal BPM or MIDI clock (24 ppqn → BPM once per beat); synced LFOs and delay follow the effective BPM.
- Sustain (CC64 / SUS) defers keyboard note-offs and HOLD-pad releases until pedal-up.
- MIDI AUTO mapping: pad i ↔ BASE + i in grid order.
- Pads: backlight layer (screen-blended radial glow + diffuser dots) while playing, and a flash keyed on the newest
  voice id so every trigger replays it.

## 18. Grid mode

`GridView.vue` wraps canvas-datagrid (lazy-loaded chunk). Rows are derived from the store; when the row set is
unchanged they're patched in place and redrawn, so sort, scroll and selection survive knob changes. Styles come from
`theme/gridStyle.ts` (theme → canvas-datagrid style keys; colours blended in JS since canvas can't use color-mix).
`rendercell` lights playing rows and tints the selected patch. Hidden columns aren't in `selectedData`, so
keyboard selection maps the row's # back to the pad. The header publishes its height as `--strip-h` so grid mode
fills exactly the remaining window.

## 19. Full-width panels, SFZ

- Pads view: an open tile takes `flex-basis: 100%`, so its panel spans the row; modules flow across it and the
  waveform / zone map resize to their container.
- SFZ: `lib/sfz.ts` parses to regions (inheritance, defines, includes); `lib/zones.ts` turns regions into Zones
  (samples → seconds via `lib/sampleRate.ts`) and picks zones per note (key, velocity, round robin, random).
  A Sound may carry `zones`; voices get a `ZonePlay` (own buffer, start/end, loop points, gain, pan, envelope
  override, one-shot). Loading walks dropped folders (`webkitGetAsEntry`), unzips packs, and resolves sample paths
  relative to the .sfz, then the drop root, then by file name.
- Grid: sized to its host (`height: 100%`) and wheel-scrolled by us while unfocused (the library only scrolls a
  focused grid, and focusing it would steal the pad shortcut keys).

## 20. SFZ depth, grain streams, library

- Generators: `audio/synthWaves.ts` builds looped band-limited wavetables (one cycle = 256 samples at a C4-derived
  sample rate, so loops are seamless); ids `synth:*` are generated on demand, never stored or exported.
- Release triggers fire on note-off (pads in HOLD, keyboard notes, sustain pedal-up), attenuated by rt_decay × held time,
  and never loop. Every MIDI CC reaches the engine (`hub.cc`); zones gate on locc/hicc and apply *_onccN live
  (amplitude modifiers multiply, as in ARIA / sfizz). Instrument CC defaults are stored per pad and re-applied on
  load / selection.
- Zone filter (+ filter EG) replaces the pad filter; zone LFOs are extra oscillators into pitch bus / filter detune /
  tremolo / pan.
- Waveform: every voice shows a transport marker; every live grain shows a playhead sweeping its slice.
- Poly grains: per-note streams with random start, offset, drift speed; overlap = density × streams.
- Library (`lib/library.ts`, `LibraryDialog.vue`): GitHub API (tree listing, cached a day), raw.githubusercontent,
  GitHub Pages; 6 fetches in flight; results go through `addFiles`.
