#include "PluginProcessor.h"
#include "PluginEditor.h"

SsbProcessor::SsbProcessor()
    : juce::AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{
}

void SsbProcessor::prepareToPlay (double, int) {}

bool SsbProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto out = layouts.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::stereo() || out == juce::AudioChannelSet::mono();
}

void SsbProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    buffer.clear();

    for (const auto metadata : midi)
    {
        const auto* bytes = metadata.data;
        const auto length = metadata.numBytes;
        if (length < 1)
            continue;
        const auto size = ssb::midiMessageSize (bytes[0]);
        if (size == 0 || length < size)
            continue;   // sysex and system common: not forwarded
        midiToPage.push ({ bytes[0],
                           size > 1 ? bytes[1] : (uint8_t) 0,
                           size > 2 ? bytes[2] : (uint8_t) 0,
                           size });
    }
    midi.clear();
}

juce::AudioProcessorEditor* SsbProcessor::createEditor()
{
    return new SsbEditor (*this);
}

void SsbProcessor::getStateInformation (juce::MemoryBlock& destination)
{
    juce::ValueTree state ("SSB");
    state.setProperty ("version", JucePlugin_VersionString, nullptr);
    state.setProperty ("width", editorWidth, nullptr);
    state.setProperty ("height", editorHeight, nullptr);
    state.setProperty ("page", pageState, nullptr);
    juce::MemoryOutputStream out (destination, false);
    state.writeToStream (out);
}

void SsbProcessor::setStateInformation (const void* data, int size)
{
    const auto state = juce::ValueTree::readFromData (data, (size_t) size);
    if (! state.hasType ("SSB"))
        return;
    editorWidth = state.getProperty ("width", editorWidth);
    editorHeight = state.getProperty ("height", editorHeight);
    pageState = state.getProperty ("page", pageState).toString();
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new SsbProcessor();
}
