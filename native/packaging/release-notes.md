Super Sound Board: sampler, synth and soundboard, as a desktop app and a plugin.

**macOS**, universal. Drag into place:

| | |
| --- | --- |
| `SSB.app` | anywhere. Your MIDI controllers are picked up automatically (Options ▸ MIDI inputs to change). |
| `SSB.component` | `~/Library/Audio/Plug-Ins/Components` — AU instrument (Logic, Live, …) |
| `SSB.vst3` | `~/Library/Audio/Plug-Ins/VST3` — VST3 instrument |

**Windows**: `SSB.vst3` into `C:\Program Files\Common Files\VST3`, and the Standalone anywhere.

In a DAW, SSB renders on the track with its own engine and keeps playing with its window closed;
open the window once so the board is sent to it (after that it is saved with the session).
