#include "PluginEditor.h"
#include "PluginPaths.h"

#include <cstdio>

#if JucePlugin_Build_Standalone
 #include <juce_audio_utils/juce_audio_utils.h>
 #include <juce_audio_plugin_client/Standalone/juce_StandaloneFilterWindow.h>
#endif

namespace
{

/** The types the built page asks for. Unknown files are octet-stream, which is right for a font
    and harmless otherwise; guessing text/plain would make a stray .js silently fail to run. */
juce::String mimeFor (const juce::String& path)
{
    static const std::pair<const char*, const char*> table[]
    {
        { ".html", "text/html" },        { ".js",    "text/javascript" },
        { ".mjs",  "text/javascript" },  { ".css",   "text/css" },
        { ".json", "application/json" }, { ".svg",   "image/svg+xml" },
        { ".woff2", "font/woff2" },      { ".woff",  "font/woff" },
        { ".png",  "image/png" },        { ".jpg",   "image/jpeg" },
        { ".ico",  "image/x-icon" },     { ".map",   "application/json" },
        { ".wav",  "audio/wav" },        { ".txt",   "text/plain" },
    };
    for (const auto& [suffix, mime] : table)
        if (path.endsWithIgnoreCase (suffix))
            return mime;
    return "application/octet-stream";
}

/** Windows needs WebView2 for a resource provider (the default backend is Internet Explorer), and
    a user data folder a plugin can write to -- beside the host's .exe it usually cannot. */
juce::WebBrowserComponent::Options withPlatformBackend (juce::WebBrowserComponent::Options options)
{
   #if JUCE_WINDOWS
    return options
        .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
        .withWinWebView2Options (juce::WebBrowserComponent::Options::WinWebView2 {}
            .withUserDataFolder (juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                                     .getChildFile ("WaveContour").getChildFile ("SSB")));
   #else
    return options;
   #endif
}

/** In the standalone, open every MIDI input rather than waiting for someone to find Options:
    plugging in a controller and playing it is what a soundboard is for. Settings chosen in the
    Options dialog still apply on later launches. */
void enableAllMidiInputs (juce::AudioProcessor& processor)
{
   #if JucePlugin_Build_Standalone
    if (processor.wrapperType != juce::AudioProcessor::wrapperType_Standalone)
        return;
    if (auto* holder = juce::StandalonePluginHolder::getInstance())
        for (const auto& device : juce::MidiInput::getAvailableDevices())
            if (! holder->deviceManager.isMidiInputDeviceEnabled (device.identifier))
                holder->deviceManager.setMidiInputDeviceEnabled (device.identifier, true);
   #else
    juce::ignoreUnused (processor);
   #endif
}

} // namespace

SsbEditor::SsbEditor (SsbProcessor& p)
    : juce::AudioProcessorEditor (&p),
      plugin (p),
      browser (withPlatformBackend (juce::WebBrowserComponent::Options {}
          .withNativeIntegrationEnabled()
          .withKeepPageLoadedWhenBrowserIsHidden()
          .withResourceProvider ([this] (const auto& path) { return provide (path); })
          .withNativeFunction ("ssbReady", [this] (const juce::Array<juce::var>&, auto complete)
          {
              auto* info = new juce::DynamicObject();
              info->setProperty ("wrapper", juce::AudioProcessor::getWrapperTypeDescription (plugin.wrapperType));
              info->setProperty ("standalone", plugin.wrapperType == juce::AudioProcessor::wrapperType_Standalone);
              info->setProperty ("version", JucePlugin_VersionString);
              info->setProperty ("state", plugin.pageState);
              complete (juce::var (info));
          })
          .withNativeFunction ("ssbSetState", [this] (const juce::Array<juce::var>& args, auto complete)
          {
              // Whatever the page wants remembered with this instance in the session.
              if (! args.isEmpty())
                  plugin.pageState = args[0].toString();
              complete (juce::var (true));
          })
          .withNativeFunction ("ssbLog", [] (const juce::Array<juce::var>& args, auto complete)
          {
              // The page's console errors and warnings, so a problem inside the web view shows up
              // in the host's log (or the terminal, for the standalone) rather than nowhere.
              juce::StringArray parts;
              for (const auto& a : args)
                  parts.add (a.toString());
              juce::Logger::writeToLog ("ssb page: " + parts.joinIntoString (" "));
              complete (juce::var (true));
          })
          .withNativeFunction ("ssbOpenUrl", [] (const juce::Array<juce::var>& args, auto complete)
          {
              // http(s) only: a native function that launches anything launches anything.
              const auto url = args.isEmpty() ? juce::String() : args[0].toString();
              const auto ok = (url.startsWithIgnoreCase ("https://") || url.startsWithIgnoreCase ("http://"))
                              && juce::URL (url).launchInDefaultBrowser();
              complete (juce::var (ok));
          })
          .withNativeFunction ("ssbSaveFile", [this] (const juce::Array<juce::var>& args, auto complete)
          {
              // A plugin's web view cannot download (JUCE wires no WKDownload), so the page hands
              // the bytes over as base64 and a native dialog saves them.
              if (args.size() < 2)
                  return complete (juce::var (false));

              auto bytes = std::make_shared<juce::MemoryBlock>();
              juce::MemoryOutputStream decoded (*bytes, false);
              if (! juce::Base64::convertFromBase64 (decoded, args[1].toString()))
                  return complete (juce::var (false));
              decoded.flush();

              const auto name = juce::File::createLegalFileName (args[0].toString());
              chooser = std::make_unique<juce::FileChooser> (
                  "Save", juce::File::getSpecialLocation (juce::File::userDocumentsDirectory).getChildFile (name));
              chooser->launchAsync (juce::FileBrowserComponent::saveMode
                                        | juce::FileBrowserComponent::canSelectFiles
                                        | juce::FileBrowserComponent::warnAboutOverwriting,
                                    [bytes, complete] (const juce::FileChooser& fc)
                                    {
                                        const auto file = fc.getResult();
                                        complete (juce::var (file != juce::File()
                                                             && file.replaceWithData (bytes->getData(), bytes->getSize())));
                                    });
          })))
{
    addAndMakeVisible (browser);
    browser.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());

    setResizable (true, true);
    setResizeLimits (960, 600, 4096, 2400);
    setSize (plugin.editorWidth, plugin.editorHeight);

    enableAllMidiInputs (plugin);

    // MIDI queued while the editor was closed is stale; start from now.
    plugin.midiToPage.clear();
    startTimer (4);

    // SSB_PROBE=<javascript>: evaluate it in the page once it has had time to load, and print the
    // result. The page's inspector is not available in a release build, and this is the one way
    // to ask a running editor a question from a terminal. SSB_PROBE_DELAY_MS overrides the wait;
    // SSB_PROBE_SETUP runs at half that delay, for measurements that need time (the probe itself
    // must return a plain value, not a promise).
    if (const auto setup = juce::SystemStats::getEnvironmentVariable ("SSB_PROBE_SETUP", {}); setup.isNotEmpty())
    {
        const auto delay = juce::SystemStats::getEnvironmentVariable ("SSB_PROBE_DELAY_MS", "4000").getIntValue();
        juce::Timer::callAfterDelay (delay / 2, [safe = juce::Component::SafePointer<SsbEditor> (this), setup]
        {
            if (safe != nullptr)
                safe->browser.evaluateJavascript (setup);
        });
    }
    if (const auto probe = juce::SystemStats::getEnvironmentVariable ("SSB_PROBE", {}); probe.isNotEmpty())
    {
        const auto delay = juce::SystemStats::getEnvironmentVariable ("SSB_PROBE_DELAY_MS", "4000").getIntValue();
        juce::Timer::callAfterDelay (delay, [safe = juce::Component::SafePointer<SsbEditor> (this), probe]
        {
            if (safe == nullptr)
                return;
            safe->browser.evaluateJavascript (probe, [] (juce::WebBrowserComponent::EvaluationResult r)
            {
                if (const auto* value = r.getResult())
                    std::printf ("ssb probe: %s\n", juce::JSON::toString (*value, true).toRawUTF8());
                else
                    std::printf ("ssb probe error: %s\n", r.getError()->message.toRawUTF8());
                std::fflush (stdout);
            });
        });
    }
}

SsbEditor::~SsbEditor()
{
    stopTimer();
}

void SsbEditor::resized()
{
    browser.setBounds (getLocalBounds());
    plugin.editorWidth = getWidth();
    plugin.editorHeight = getHeight();
}

void SsbEditor::timerCallback()
{
    // Everything that arrived since the last tick, as one event: [[status, d1, d2], ...].
    juce::Array<juce::var> batch;
    ssb::MidiMessage m;
    while (batch.size() < 1024 && plugin.midiToPage.pop (m))
    {
        juce::Array<juce::var> bytes;
        bytes.add ((int) m.status);
        if (m.size > 1) bytes.add ((int) m.data1);
        if (m.size > 2) bytes.add ((int) m.data2);
        batch.add (juce::var (bytes));
    }
    if (! batch.isEmpty())
        browser.emitEventIfBrowserIsVisible ("ssbMidi", juce::var (batch));
}

std::optional<juce::WebBrowserComponent::Resource> SsbEditor::provide (const juce::String& path)
{
    const auto root = ssb::webRoot();
    const auto relative = path == "/" ? juce::String ("index.html") : path.fromFirstOccurrenceOf ("/", false, false);
    const auto file = root.getChildFile (relative.upToFirstOccurrenceOf ("?", false, false));

    // Nothing outside the page's own folder.
    if (! file.isAChildOf (root) || ! file.existsAsFile())
        return std::nullopt;

    juce::MemoryBlock block;
    if (! file.loadFileAsData (block))
        return std::nullopt;

    const auto* data = static_cast<const std::byte*> (block.getData());
    return juce::WebBrowserComponent::Resource { std::vector<std::byte> (data, data + block.getSize()),
                                                 mimeFor (file.getFileName()) };
}
