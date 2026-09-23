#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <ssb/MidiQueue.h>

/**
    SSB as an instrument. Everything the user sees and hears is the page (the editor); the
    processor's job so far is to take the MIDI a host -- or, in the standalone, your MIDI
    controllers -- delivers and hand it to the page, which plays it exactly as it plays Web MIDI in
    a browser.

    The page's sound currently leaves through the web view's own audio output (the system device),
    not through this processor's buses: a web view offers no way to capture its audio. The
    standalone doesn't mind. In a DAW it means SSB plays but isn't on the track -- the native
    engine, which renders into processBlock, is the next step. @see ../README.md
*/
class SsbProcessor final : public juce::AudioProcessor
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

    /** The editor's size, kept with the session so it reopens as it was left. */
    int editorWidth { 1600 }, editorHeight { 1000 };

    /** What the page asked to keep with this instance (opaque to C++). The board itself lives in
        the web view's IndexedDB, which every instance on the machine shares. */
    juce::String pageState;

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SsbProcessor)
};
