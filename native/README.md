# SSB — native

Super Sound Board as a **standalone app** and an **AU / VST3 instrument**. The web app in `../src`
keeps shipping unchanged, and the plugin does not contain a second copy of it: the page Vite
built (`../dist`) is copied into each bundle and is the editor.

**Where the sound comes from**

- **Standalone**: the page plays itself (Web Audio in the web view), exactly as in a browser, and
  the app feeds it your MIDI controllers.
- **AU / VST3**: a native engine (`engine/`) renders into the plugin's output, so SSB is on the
  track, follows the host's tempo and keeps playing with its window closed. The page is the
  editor: it pushes its sounds and settings to the engine and sends clicks and keys as commands.

```
npm ci && npm run build          # the page, from the repository root
cmake -B native/build -S native -G Ninja -DCMAKE_OSX_ARCHITECTURES=arm64
cmake --build native/build
ctest --test-dir native/build --output-on-failure
```

Universal (`arm64;x86_64`) by default; pass `-DCMAKE_OSX_ARCHITECTURES=arm64` while iterating.
JUCE 8 is fetched by the build. CMake 3.22+, a C++20 compiler and a built `dist/` are the whole
list. `-G "Unix Makefiles"` works as well as Ninja.

---

## How it fits together

| | |
| --- | --- |
| `plugin/PluginEditor` | A `WebBrowserComponent` serving the page from `Contents/Resources/web` through JUCE's `ResourceProvider` (a `juce://` origin, a secure context — IndexedDB works, so the board persists). Native functions add what a web view lacks: MIDI, a save dialog, opening links in the real browser, and a log for the page's errors. |
| `plugin/PluginProcessor` | Takes the MIDI a host (or, in the standalone, your controllers) delivers: queues it for the page, and (AU / VST3) plays it through the engine. Saves the engine's sounds and settings with the session. |
| `plugin/SoundLibrary` | The page's sounds as the engine needs them; rebuilds the engine's `Performance` on every change. `SampleStore` keeps decoded samples, shared by every instance and cached on disk (`~/Library/Application Support/WaveContour/SSB/samples`), so a reopened session plays before its editor loads. |
| `engine/` | The native engine: a port of `src/audio` (voice, engine, master FX) and the note logic in `src/stores/board.ts`. Allocation- and lock-free on the audio thread. |
| `core/` | No JUCE: `MidiQueue`, the wait-free ring between the audio thread and the editor. Tested on its own. |
| `tools/ssb-host` | Loads the built plugin like a DAW, opens the editor (so the page runs and syncs), plays MIDI from a real-time-paced audio thread and records the output. |
| `cmake/` | Copying the built page into each bundle and re-sealing it (adding files breaks a code signature, and hardened hosts refuse a broken one). |
| `tools/` | Signing, notarising, and pushing the signing secrets to GitHub. See `packaging/SIGNING.md`. |
| `../src/native/bridge.ts` | The page's half: detects the native web view, receives `ssbMidi` events, calls native functions. In a browser it is inert. |
| `../src/native/engineSync.ts` | Keeps the engine in step with the board (sounds, patches, master, pad notes; only what changed) and uploads each sample once. |

**The standalone** opens every MIDI input it finds on launch, so a controller plugged in before
starting just plays. **Options** (top left) picks inputs and the audio device. Its window is SSB's
own (`plugin/StandaloneApp.cpp`): every edge resizes it, a double-click on the title bar (or the
maximise button) zooms it to fill the screen and back, and it reopens at the size it was left.

**In a DAW** the host owns the window, so the editor carries its own resize handles: a thin
strip along the right and bottom edges and a grip in the corner, beside the page (the web view is
a native view drawn over anything JUCE paints, so handles on top of it could never be clicked).
The host's title bar isn't the plugin's to hear, so zooming is the ⤢ button in BOARD, or a
double-click on the header's empty space: the window grows to the screen's edge from where it
sits, and back.

**The host's clock**: in a DAW, SSB takes its tempo from the host (the header's tempo chip reads
HOST): synced LFOs lock to the song position while the transport plays, and synced delays use the
host tempo, in the engine itself, so they follow even with the window closed.

---

## The engine

It reproduces what the page's Web Audio graph does, down to the details that change the sound:
Web Audio's biquad formulas (low / high-pass Q in dB), the page's linear ADSR, `StereoPannerNode`'s
pan law (and the fact that every page voice reaches its panner as stereo), the ConvolverNode's
normalisation of the page's noise impulses, and FM from a VCO held per 128-sample render quantum
(the page drives a k-rate `detune`). Measured against the page with `ssb-host`: FM PIANO's level
matches to 0.1 % dry and its envelope and harmonics match with chorus and reverb on; a grain
cloud's level matches to 0.1 %.

**Ported:** pads (trigger modes, choke groups, clip, repeat, loop), keyboard play of the selected
patch (poly / mono, glide, MPE bend / pressure / timbre, the sustain pedal), patches' VCO slots
(MIX / MOD, TRACK / FIXED, transpose, fine, level) with VCO 1–3 as audio-rate sources, the mod
matrix (LFO shapes including random / smooth, mod wheel, aftertouch, velocity, bend, timbre,
grain position / size), amp and filter envelopes, the filter and 3-band EQ, grain clouds (streams,
density, jitter, reverse, spread, scatter, drift) and STRETCH, per-sound delay and reverb, master
chorus / delay / reverb / volume, and SFZ zones (key / velocity / round robin / random layers,
loops, one-shots, release triggers with rt_decay, locc / hicc, the *_onccN modifiers, region
filters, envelopes and LFOs). The engine reports its voices back to the page ~30 times a second,
so pads light, progress rings turn and waveform playheads move for notes it plays.

**The library is shared, the performance is the instance's.** Every SSB in a DAW sees one library
(sounds, patches, presets), kept in the web view's storage; when one instance saves, the others
reload it (a BroadcastChannel), so two open windows never overwrite each other's additions. What an
instance plays -- its patch or sound, keyboard mode, volume, FX, mod matrix, MIDI mapping -- is its
own and is saved with the host session (`ssbSetState`). A new instance starts in keyboard play
with pads mapped to notes automatically. If the page's storage has lost a sample, it is restored
from the plugin's disk cache (`ssbGetAudio`). (Before 0.2 each instance kept a board of its own;
the first load merges those into the library.)

A session reopened in a DAW plays before its window is opened: the engine's sounds are in the
session and its samples in the disk cache (`ssb-host --reload` checks exactly that;
`--dump-state` prints what an instance saved).

**Not yet:** a grain cloud shows no per-grain marks on the waveform in the plugin.

Per-sound delay and reverb run on buses shared by every voice with the same settings; both
effects are linear, so that is the same sound as a copy per voice, for a fraction of the work.

---

## Iterating on the page

```
export SSB_WEB_DIR=$PWD/dist      # serve the page from here instead of the bundle
npm run build                     # then close and reopen the editor
```

`open` hands an app to LaunchServices, which does not inherit your shell's environment — use
`open --env SSB_WEB_DIR=... SSB.app`, or run `SSB.app/Contents/MacOS/SSB` directly. The editor
logs where it is serving from, once per process (`ssb: serving the page from …`).

**Asking the running page a question** (there is no inspector in a release build):

```
SSB_PROBE='JSON.stringify({ sounds: __ssb.board.sounds.length, audio: __ssb.audio() })' \
  native/build/plugin/SsbInstrument_artefacts/RelWithDebInfo/Standalone/SSB.app/Contents/MacOS/SSB
```

`SSB_PROBE` is evaluated in the page after `SSB_PROBE_DELAY_MS` (default 4000) and its value
printed; `SSB_PROBE_SETUP` runs at half that delay, for things that need time to measure. The
page's console errors and warnings are forwarded to the log as `ssb page: …`.

A page that reports itself **hidden** (an app launched in the background, a covered window) gets
no `requestAnimationFrame`, so meters and lists that lay themselves out in a frame wait until the
window is shown. That is WebKit, not SSB.

---

## Identity

`WaveContour` / manufacturer `WvCt`, like Waveshape and jamin, with plugin code `Ssb1`. Hosts
remember a plugin by those two codes alone, so they never change after a release;
`CMakeLists.txt` refuses to configure against a code another WaveContour plugin already holds.

---

## Validating

```
# the engine on its own: pitch, envelopes, repeat, choke, zones, glide, filter, FM, sustain, FX
ctest --test-dir native/build --output-on-failure

# the whole thing: page -> sync -> engine -> audio, then a reopened session with no editor.
# --bpm sets the tempo of the transport ssb-host plays (the page should read HOST at that tempo).
# SSB_PROBE_SETUP sets the board up.
SSB_PROBE_DELAY_MS=5000 SSB_PROBE_SETUP="const b = __ssb.board; b.selectPatch(b.patches[0].id); b.master.play = true" \
  native/build/tools/ssb-host_artefacts/RelWithDebInfo/ssb-host.app/Contents/MacOS/ssb-host \
  native/build/plugin/SsbInstrument_artefacts/RelWithDebInfo/VST3/SSB.vst3 out.wav --note 69 --wait 7 --reload
```

```
native/tools/macos-sign.sh native/build/plugin      # Developer ID from your login keychain
pluginval --strictness-level 10 --validate native/build/plugin/SsbInstrument_artefacts/RelWithDebInfo/VST3/SSB.vst3
```

CI (`.github/workflows/native.yml`) builds universal, runs the core tests, signs when the secrets
are present, runs `auval` and `pluginval` against the signed bundles, notarises on `v*` tags (or
when run by hand with **notarize**), and publishes a GitHub release for tags.
