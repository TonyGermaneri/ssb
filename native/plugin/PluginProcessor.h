#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <ssb/Engine.h>
#include <ssb/MidiQueue.h>

#include "SoundLibrary.h"
#include "McpServer.h"
#include "SoundHost.h"

/**
    SSB as an instrument. The editor is the page; the sound depends on where SSB is running:

    - **AU / VST3**: the native engine (engine/) renders into processBlock, so SSB is on the
      track and plays with its editor closed. The page is the editor: it pushes its sounds and
      settings here (SoundLibrary) and sends clicks and computer-keyboard notes as commands.
    - **Standalone**: the page plays itself through the web view's audio output, exactly as in a
      browser (grains and all); the processor hands it the MIDI from your controllers.

    Host MIDI is also forwarded to the page in both, for MIDI learn and the on-screen state.
*/
class SsbProcessor final : public juce::AudioProcessor,
                           private juce::Timer
{
public:
    SsbProcessor();

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using juce::AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    /** Hosts (Live, Logic: the AU's SupportsMPE property) only send a controller's per-note channels to an
        instrument that says it takes MPE; without this they merge them onto one channel and per-note bend is lost. */
    bool supportsMPE() const override { return true; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int) override;

    /** Host / controller MIDI on its way to the page. Audio thread pushes, editor pops. */
    ssb::MidiQueue midiToPage;

    /** The host's transport as of the last block, for the page's tempo display. */
    std::atomic<double> hostBpm { 0 }, hostPpq { -1 };
    std::atomic<bool> hostPlaying { false };

    /** True in a DAW (AU / VST3): the native engine makes the sound. */
    const bool usesEngine;
    ssb::Engine engine;
    ssb::SoundLibrary library { engine };

    /** The editor's size, kept with the session so it reopens as it was left. */
    int editorWidth { 1600 }, editorHeight { 1000 };

    /** What the page asked to keep with this instance (opaque to C++). The board itself lives in
        the web view's IndexedDB, which every instance on the machine shares. */
    juce::String pageState;

    /** SSB's MCP server for this instance: off until the page turns it on (AI ▸ ⚙ ▸ MCP SERVER).
        It lives with the processor; its requests reach the page while the editor is open. */
    ssb::McpServer mcp;

    /** The AI agent's sound models (audio.cpp in a helper process): one host for every instance in this
        process, so a DAW with several SSB tracks runs one helper holding one model. */
    juce::SharedResourcePointer<ssb::SoundHost> sound;

    /** This instance's board, as the page stores it: new instances get a new one, a session
        restores its own. Unused in the standalone, which has the one board. */
    juce::String boardKey { juce::Uuid().toString() };

private:
    void timerCallback() override { engine.collectGarbage(); }

    /** expires with the processor: guards callbacks queued to the message thread */
    std::shared_ptr<int> lifetime = std::make_shared<int> (0);

    std::vector<ssb::MidiEvent> events;
    std::vector<float> scratch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SsbProcessor)
};
