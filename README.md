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

PLAY (vol, pan, repeat, choke) · TUNE (pitch, fine, speed + TAPE/STRETCH) · CLIP · ADSR · FILTER (LP/HP/BP) ·
FILTER ADSR · EQ · GRAIN (size, pos, width, density, jitter, reverse, spread) · DELAY · REVERB ·
MODE (STOP / RESTART / STACK / HOLD) · MIDI LEARN · RESET · duplicate · delete.

- **RPT**: `1` = once, `N` = N times, `0` = loop forever.
- **TAPE**: pitch and speed both change playback rate, like a sampler. **STRETCH**: granular; speed changes length, pitch stays put.
- STOP re-press, HOLD release and MIDI note-off run the ADSR release and let FX tails ring. PANIC / choke / RESTART cut instantly.

### Header

OUTPUT · NOW PLAYING + VU · PATCH (◀ selected ▶, PLAY, POLY/MONO, octave, GLIDE) · global CHORUS / DELAY / REVERB ·
VIEW (pad SCALE, scanlines) · TAGS filter · BOARD (add, MIDI, export, import). Wraps into rows on narrow windows.

- **Select a patch** with the piano button in a pad's lower-right corner, or ◀ ▶ in the header.
- **PLAY** turns MIDI and the computer keyboard into a piano for the selected patch (C4 = original pitch).
  Computer keys: `Z` row = C3 octave, `Q` row = C4 octave, `-` / `=` = octave down/up.
- **MONO** + **GLIDE** = legato portamento; **POLY** = each note its own voice (glide slides from the last note).

See [PLAN.md](PLAN.md) for the design and audio graph.
