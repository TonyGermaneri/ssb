// ssb-host: load the built plugin the way a DAW does, open its editor (so the page runs and syncs
// the board to the engine), play MIDI into it from a real-time-paced "audio thread", and record
// what comes out.
//
//   ssb-host <SSB.vst3 | SSB.component> <out.wav> [--note 69] [--wait 6] [--hold 1.5]
//
// Prints the output's RMS and pitch, and exits non-zero if it was silent. SSB_PROBE_SETUP (see
// plugin/PluginEditor.cpp) is how a run sets the board up, e.g. to select a patch and turn on
// keyboard play before the notes arrive.

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include <atomic>
#include <cmath>
#include <thread>

namespace
{
struct Window final : juce::DocumentWindow
{
    explicit Window (juce::AudioProcessorEditor* editor)
        : DocumentWindow ("ssb-host", juce::Colours::black, DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar (true);
        setContentOwned (editor, true);
        setResizable (true, false);
        centreWithSize (editor->getWidth(), editor->getHeight());
        setVisible (true);
        toFront (true);
    }
    void closeButtonPressed() override {}
};

double argDouble (const juce::StringArray& args, const char* name, double fallback)
{
    const auto i = args.indexOf (name);
    return i >= 0 && i + 1 < args.size() ? args[i + 1].getDoubleValue() : fallback;
}
} // namespace

int main (int argc, char** argv)
{
    juce::ScopedJuceInitialiser_GUI gui;
    juce::StringArray args;
    for (int i = 1; i < argc; ++i) args.add (argv[i]);
    if (args.size() < 2)
    {
        std::fprintf (stderr, "usage: ssb-host <plugin> <out.wav> [--note N] [--wait S] [--hold S]\n");
        return 2;
    }
    const juce::File pluginFile (juce::File::getCurrentWorkingDirectory().getChildFile (args[0]));
    const juce::File outFile (juce::File::getCurrentWorkingDirectory().getChildFile (args[1]));
    const int note = (int) argDouble (args, "--note", 69);
    const double wait = argDouble (args, "--wait", 6), hold = argDouble (args, "--hold", 1.5);
    constexpr double rate = 48000;
    constexpr int block = 480;   // 10 ms

    juce::AudioPluginFormatManager formats;
    juce::addDefaultFormatsToManager (formats);
    juce::OwnedArray<juce::PluginDescription> found;
    for (auto* format : formats.getFormats())
        if (format->fileMightContainThisPluginType (pluginFile.getFullPathName()))
            format->findAllTypesForFile (found, pluginFile.getFullPathName());
    if (found.isEmpty())
    {
        std::fprintf (stderr, "no plugin in %s\n", pluginFile.getFullPathName().toRawUTF8());
        return 2;
    }
    juce::String error;
    auto plugin = formats.createPluginInstance (*found[0], rate, block, error);
    if (! plugin)
    {
        std::fprintf (stderr, "could not load: %s\n", error.toRawUTF8());
        return 2;
    }
    std::printf ("loaded %s (%s)\n", found[0]->name.toRawUTF8(), found[0]->pluginFormatName.toRawUTF8());
    plugin->setPlayConfigDetails (0, 2, rate, block);
    plugin->prepareToPlay (rate, block);

    auto window = std::make_unique<Window> (plugin->createEditorIfNeeded());

    // the "audio thread": real-time paced blocks, MIDI at the scheduled times, output recorded
    const auto total = (int) ((wait + hold + 1.0) * rate);
    juce::AudioBuffer<float> recorded (2, total);
    recorded.clear();
    std::atomic<bool> done { false };
    std::thread audio ([&]
    {
        juce::AudioBuffer<float> buffer (2, block);
        const auto start = std::chrono::steady_clock::now();
        for (int pos = 0; pos + block <= total; pos += block)
        {
            juce::MidiBuffer midi;
            const auto on = (int) (wait * rate), off = (int) ((wait + hold) * rate);
            if (on >= pos && on < pos + block) midi.addEvent (juce::MidiMessage::noteOn (1, note, (juce::uint8) 100), on - pos);
            if (off >= pos && off < pos + block) midi.addEvent (juce::MidiMessage::noteOff (1, note), off - pos);
            buffer.clear();
            plugin->processBlock (buffer, midi);
            for (int ch = 0; ch < 2; ++ch)
                recorded.copyFrom (ch, pos, buffer, ch, 0, block);
            std::this_thread::sleep_until (start + std::chrono::microseconds ((juce::int64) ((pos + block) / rate * 1e6)));
        }
        done = true;
    });
    while (! done)
        juce::MessageManager::getInstance()->runDispatchLoopUntil (20);
    audio.join();

    window.reset();
    plugin->releaseResources();
    plugin.reset();

    // measure the held part of the note
    const auto from = (int) ((wait + 0.1) * rate), to = (int) ((wait + hold) * rate);
    double sum = 0;
    int crossings = 0;
    double first = -1, last = -1;
    const float* l = recorded.getReadPointer (0);
    for (int i = from; i < to; ++i)
    {
        sum += (double) l[i] * l[i];
        if (i > from && l[i - 1] <= 0 && l[i] > 0)
        {
            const double t = i / rate;
            if (first < 0) first = t;
            last = t;
            ++crossings;
        }
    }
    const double rms = std::sqrt (sum / std::max (1, to - from));
    const double hz = crossings > 1 ? (crossings - 1) / (last - first) : 0.0;
    std::printf ("rms %.4f  zero-crossing pitch %.1f Hz\n", rms, hz);

    outFile.deleteFile();
    juce::WavAudioFormat wav;
    if (auto stream = std::unique_ptr<juce::OutputStream> (outFile.createOutputStream()))
        if (auto writer = std::unique_ptr<juce::AudioFormatWriter> (wav.createWriterFor (stream.get(), rate, 2, 24, {}, 0)))
        {
            stream.release();
            writer->writeFromAudioSampleBuffer (recorded, 0, recorded.getNumSamples());
        }
    return rms > 1e-3 ? 0 : 1;
}
