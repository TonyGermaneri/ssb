#pragma once

// SSB's sound engine for the plugin: plays the page's sounds and patches from MIDI, on the audio
// thread, with no page running. A port of src/audio (voice.ts, engine.ts, masterFx.ts) and the
// note logic in src/stores/board.ts.
//
// Threads: `setPerformance`, `prepare` and `collectGarbage` are for the message thread; `process`
// is the audio thread; `post` (commands from the editor) is safe from either. Nothing on the audio
// thread allocates or locks.

#include "Dsp.h"
#include "Model.h"

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <string_view>
#include <vector>

namespace juce::dsp { class Convolution; }

namespace ssb
{

/** A command from the editor (a pad clicked, a key played on the page's keyboard). */
struct Command
{
    enum class Type : uint8_t { press, release, noteOn, noteOff, panic, cc, midi };
    Type type { Type::panic };
    char id[64] {};          // press / release: the sound (or patch layer) id
    float velocity { 1 };
    uint8_t note { 60 }, channel { 0 }, cc { 0 };
    float value { 0 };       // cc value 0..1
    uint8_t bytes[3] {};     // midi: a raw short message (the page's bend wheel, mod knob, pedal)

    static Command make (Type t, std::string_view soundId = {}, float vel = 1);
};

/** Short MIDI message at a sample offset within the block. */
struct MidiEvent
{
    int offset { 0 };
    uint8_t status { 0 }, data1 { 0 }, data2 { 0 };
};

class Engine
{
public:
    static constexpr int maxVoices = 64;

    Engine();
    ~Engine();

    // ---- message thread ------------------------------------------------------------------
    void prepare (double sampleRate, int maxBlockSize);

    /** Swap in what to play. Voices already sounding follow the new settings of their sound (by
        id), as the page's voices follow knob changes. Reverb impulses the new settings need are
        loaded here, off the audio thread. */
    void setPerformance (PerformancePtr next);

    /** Free what the audio thread has finished with (old performances, sounds, samples). */
    void collectGarbage();

    // ---- any thread ----------------------------------------------------------------------
    bool post (const Command& c) noexcept;

    // ---- audio thread ----------------------------------------------------------------------
    /** Render `n` samples into `left` / `right` (overwritten). `hostBpm` <= 0 = use the page's. */
    void process (float* left, float* right, int n, const MidiEvent* midi, int midiCount, double hostBpm) noexcept;

    // ---- meters (any thread) ---------------------------------------------------------------
    float peak (int channel) const noexcept { return peaks[(size_t) (channel & 1)].load (std::memory_order_relaxed); }
    int activeVoices() const noexcept { return active.load (std::memory_order_relaxed); }

    double sampleRate() const noexcept { return rate; }

private:
    struct Voice;
    struct Impl;
    std::unique_ptr<Impl> impl;

    double rate { 48000 };
    std::array<std::atomic<float>, 2> peaks {};
    std::atomic<int> active { 0 };
};

/** Web Audio's ConvolverNode normalisation (on by default): scales an impulse so reverbs of any
    length come out at a similar level. From the spec's calculateNormalizationScale. */
float convolverNormalisation (const std::vector<std::vector<float>>& ir, double sampleRate) noexcept;

} // namespace ssb
