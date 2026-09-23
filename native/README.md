# SSB — native

Super Sound Board as a **standalone app** and an **AU / VST3 instrument**. The web app in `../src`
keeps shipping unchanged, and the plugin does not contain a second copy of it: the page Vite
built (`../dist`) is copied into each bundle and is the editor.

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
| `plugin/PluginProcessor` | Takes the MIDI a host (or, in the standalone, your controllers) delivers and queues it for the page. |
| `core/` | No JUCE: `MidiQueue`, the wait-free ring between the audio thread and the editor. Tested on its own. |
| `cmake/` | Copying the built page into each bundle and re-sealing it (adding files breaks a code signature, and hardened hosts refuse a broken one). |
| `tools/` | Signing, notarising, and pushing the signing secrets to GitHub. See `packaging/SIGNING.md`. |
| `../src/native/bridge.ts` | The page's half: detects the native web view, receives `ssbMidi` events, calls native functions. In a browser it is inert. |

**The standalone** opens every MIDI input it finds on launch, so a controller plugged in before
starting just plays. **Options** (top left) picks inputs and the audio device.

**In a DAW** the plugin receives the track's MIDI and the page plays it, but a web view gives no
way to capture its audio, so the sound leaves through the system output rather than the plugin's
buses — it plays, it just isn't on the track. The next step is a native engine that renders into
`processBlock`, with the page as its editor.

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
native/tools/macos-sign.sh native/build/plugin      # Developer ID from your login keychain
pluginval --strictness-level 10 --validate native/build/plugin/SsbInstrument_artefacts/RelWithDebInfo/VST3/SSB.vst3
```

CI (`.github/workflows/native.yml`) builds universal, runs the core tests, signs when the secrets
are present, runs `auval` and `pluginval` against the signed bundles, notarises on `v*` tags (or
when run by hand with **notarize**), and publishes a GitHub release for tags.
