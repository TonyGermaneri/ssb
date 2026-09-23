#include "PluginProcessor.h"
#include "PluginEditor.h"

SsbProcessor::SsbProcessor()
    : juce::AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      // wrapperType is already known here: JUCE sets it before constructing the processor
      usesEngine (wrapperType != wrapperType_Standalone)
{
    events.reserve (2048);
    startTimer (500);
}

void SsbProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    engine.prepare (sampleRate, samplesPerBlock);
    scratch.assign ((size_t) std::max (samplesPerBlock, 1), 0.0f);
}

bool SsbProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto out = layouts.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::stereo() || out == juce::AudioChannelSet::mono();
}

void SsbProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    events.clear();

    for (const auto metadata : midi)
    {
        const auto* bytes = metadata.data;
        const auto length = metadata.numBytes;
        if (length < 1)
            continue;
        const auto size = ssb::midiMessageSize (bytes[0]);
        if (size == 0 || length < size)
            continue;   // sysex and system common: not forwarded
        const ssb::MidiMessage m { bytes[0], size > 1 ? bytes[1] : (uint8_t) 0, size > 2 ? bytes[2] : (uint8_t) 0, size };
        midiToPage.push (m);
        if (usesEngine && events.size() < events.capacity())
            events.push_back ({ metadata.samplePosition, m.status, m.data1, m.data2 });
    }
    midi.clear();

    const auto n = buffer.getNumSamples();
    if (! usesEngine || buffer.getNumChannels() == 0 || n == 0)
    {
        buffer.clear();
        return;
    }

    double bpm = 0;
    if (auto* head = getPlayHead())
        if (const auto position = head->getPosition())
            if (const auto hostBpm = position->getBpm())
                bpm = *hostBpm;

    auto* left = buffer.getWritePointer (0);
    float* right = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : nullptr;
    if (right == nullptr)
    {
        if ((int) scratch.size() < n)
            return buffer.clear();   // the host broke its block-size promise; stay silent
        right = scratch.data();
    }
    engine.process (left, right, n, events.data(), (int) events.size(), bpm);
    if (buffer.getNumChannels() == 1)
        for (int i = 0; i < n; ++i)
            left[i] = 0.5f * (left[i] + right[i]);
    for (int ch = 2; ch < buffer.getNumChannels(); ++ch)
        buffer.clear (ch, 0, n);
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
    state.setProperty ("board", boardKey, nullptr);
    if (usesEngine)
        state.setProperty ("engine", library.saveState(), nullptr);
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
    if (const auto key = state.getProperty ("board").toString(); key.isNotEmpty())
        boardKey = key;
    if (usesEngine && state.hasProperty ("engine"))
        library.restoreState (state.getProperty ("engine").toString());
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new SsbProcessor();
}
