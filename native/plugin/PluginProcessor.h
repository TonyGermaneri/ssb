#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <ssb/Engine.h>
#include <ssb/MidiQueue.h>

#include "SoundLibrary.h"

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

    /** True in a DAW (AU / VST3): the native engine makes the sound. */
    const bool usesEngine;
    ssb::Engine engine;
    ssb::SoundLibrary library { engine };

    /** The editor's size, kept with the session so it reopens as it was left. */
    int editorWidth { 1600 }, editorHeight { 1000 };

    /** What the page asked to keep with this instance (opaque to C++). The board itself lives in
        the web view's IndexedDB, which every instance on the machine shares. */
    juce::String pageState;

private:
    void timerCallback() override { engine.collectGarbage(); }

    std::vector<ssb::MidiEvent> events;
    std::vector<float> scratch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SsbProcessor)
};
