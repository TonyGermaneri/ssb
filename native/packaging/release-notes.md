Super Sound Board: sampler, synth and soundboard, as a desktop app and a plugin.

**macOS**, universal. Drag into place:

| | |
| --- | --- |
| `SSB.app` | anywhere. Your MIDI controllers are picked up automatically (Options ▸ MIDI inputs to change). |
| `SSB.component` | `~/Library/Audio/Plug-Ins/Components` — AU instrument (Logic, Live, …) |
| `SSB.vst3` | `~/Library/Audio/Plug-Ins/VST3` — VST3 instrument |

**Windows**: `SSB.vst3` into `C:\Program Files\Common Files\VST3`, and the Standalone anywhere.

In a DAW the plugin takes the track's MIDI, but its sound still comes from the page's own audio
output (your system audio device) rather than the track. Rendering inside the DAW is on the way.
