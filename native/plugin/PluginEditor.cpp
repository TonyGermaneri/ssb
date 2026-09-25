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
          // read synchronously by the page at startup: who makes the sound
          .withInitialisationData ("ssbEngine", p.usesEngine)
          .withInitialisationData ("ssbBoard", p.usesEngine ? p.boardKey : juce::String())
          .withNativeFunction ("ssbReady", [this] (const juce::Array<juce::var>&, auto complete)
          {
              auto* info = new juce::DynamicObject();
              info->setProperty ("wrapper", juce::AudioProcessor::getWrapperTypeDescription (plugin.wrapperType));
              info->setProperty ("standalone", plugin.wrapperType == juce::AudioProcessor::wrapperType_Standalone);
              info->setProperty ("version", JucePlugin_VersionString);
              info->setProperty ("state", plugin.pageState);
              info->setProperty ("engine", plugin.usesEngine);
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
          .withNativeFunction ("ssbSync", [this] (const juce::Array<juce::var>& args, auto complete)
          {
              // { sounds?: [sound json], meta?: {...} } from the page; answers the audioIds the
              // engine still needs (neither sent yet nor in the disk cache).
              if (! args.isEmpty())
              {
                  const auto msg = juce::JSON::parse (args[0].toString());
                  if (const auto sounds = msg.getProperty ("sounds", {}); sounds.isArray())
                      plugin.library.setSounds (sounds);
                  if (const auto meta = msg.getProperty ("meta", {}); meta.isObject())
                      plugin.library.setMeta (meta);
              }
              complete (juce::var (plugin.library.missingAudio()));
          })
          .withNativeFunction ("ssbAudio", [this] (const juce::Array<juce::var>& args, auto complete)
          {
              // (audioId, sampleRate, channels, base64 of planar float32)
              if (args.size() < 4)
                  return complete (juce::var (false));
              juce::MemoryOutputStream decoded;
              if (! juce::Base64::convertFromBase64 (decoded, args[3].toString()))
                  return complete (juce::var (false));
              const auto channels = juce::jlimit (1, 2, (int) args[2]);
              const auto frames = decoded.getDataSize() / sizeof (float) / (size_t) channels;
              auto sample = std::make_shared<ssb::Sample>();
              sample->rate = (double) args[1];
              const auto* data = static_cast<const float*> (decoded.getData());
              for (int ch = 0; ch < channels; ++ch)
                  sample->channels.emplace_back (data + (size_t) ch * frames, data + (size_t) (ch + 1) * frames);
              plugin.library.addSample (args[0].toString().toStdString(), sample);
              complete (juce::var (true));
          })
          .withNativeFunction ("ssbGetAudio", [] (const juce::Array<juce::var>& args, auto complete)
          {
              // A sample from the disk cache, for a page whose own storage lost it:
              // { rate, channels, data: base64 of planar float32 } or null.
              if (args.isEmpty())
                  return complete (juce::var());
              const auto sample = ssb::SampleStore::instance().get (args[0].toString().toStdString());
              if (! sample || sample->frames() == 0)
                  return complete (juce::var());
              juce::MemoryBlock pcm;
              for (const auto& ch : sample->channels)
                  pcm.append (ch.data(), ch.size() * sizeof (float));
              juce::MemoryOutputStream encoded;
              juce::Base64::convertToBase64 (encoded, pcm.getData(), pcm.getSize());
              auto* o = new juce::DynamicObject();
              o->setProperty ("rate", sample->rate);
              o->setProperty ("channels", (int) sample->channels.size());
              o->setProperty ("data", encoded.toString());
              complete (juce::var (o));
          })
          .withNativeFunction ("ssbCommand", [this] (const juce::Array<juce::var>& args, auto complete)
          {
              // A pad click or a computer-keyboard note from the page, for the engine to play.
              using T = ssb::Command::Type;
              if (args.isEmpty())
                  return complete (juce::var (false));
              const auto& c = args[0];
              const auto type = c.getProperty ("type", {}).toString();
              const T t = type == "press" ? T::press : type == "release" ? T::release : type == "noteOn" ? T::noteOn
                        : type == "noteOff" ? T::noteOff : type == "cc" ? T::cc : type == "midi" ? T::midi : T::panic;
              auto cmd = ssb::Command::make (t, c.getProperty ("id", {}).toString().toStdString(),
                                             (float) (double) c.getProperty ("velocity", 1.0));
              cmd.note = (uint8_t) juce::jlimit (0, 127, (int) c.getProperty ("note", 60));
              cmd.channel = (uint8_t) juce::jlimit (0, 15, (int) c.getProperty ("channel", 0));
              cmd.cc = (uint8_t) juce::jlimit (0, 127, (int) c.getProperty ("cc", 0));
              cmd.value = (float) (double) c.getProperty ("value", 0.0);
              if (auto* bytes = c.getProperty ("bytes", {}).getArray())
                  for (int i = 0; i < 3 && i < bytes->size(); ++i)
                      cmd.bytes[i] = (uint8_t) juce::jlimit (0, 255, (int) (*bytes)[i]);
              complete (juce::var (plugin.engine.post (cmd)));
          })
          .withNativeFunction ("ssbZoom", [this] (const juce::Array<juce::var>&, auto complete)
          {
              toggleZoom();
              complete (juce::var (! unzoomed.isEmpty()));   // zoomed now?
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

    // Read the saved size first: setResizeLimits clamps this (still 0 x 0) editor to the minimum,
    // and resized() would otherwise record that as the size to reopen at.
    const auto width = plugin.editorWidth, height = plugin.editorHeight;
    // The standalone's window edges resize it (StandaloneApp.cpp). In a DAW the host owns the
    // window, so the editor carries its own handles, beside the page (see PluginEditor.h).
    setResizable (true, false);
    setResizeLimits (960, 600, 8192, 8192);
    setSize (width, height);
    sized = true;
    if (plugin.wrapperType != juce::AudioProcessor::wrapperType_Standalone)
    {
        rightEdge = std::make_unique<juce::ResizableEdgeComponent> (this, getConstrainer(), juce::ResizableEdgeComponent::rightEdge);
        bottomEdge = std::make_unique<juce::ResizableEdgeComponent> (this, getConstrainer(), juce::ResizableEdgeComponent::bottomEdge);
        corner = std::make_unique<juce::ResizableCornerComponent> (this, getConstrainer());
        for (juce::Component* c : { (juce::Component*) rightEdge.get(), (juce::Component*) bottomEdge.get(), (juce::Component*) corner.get() })
            addAndMakeVisible (c);
        resized();
    }

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

void SsbEditor::paint (juce::Graphics& g)
{
    // the strips around the page, where the resize handles are: the console's dark, with a grip
    g.fillAll (juce::Colour (0xff0e0d10));
    if (corner)
    {
        g.setColour (juce::Colour (0xff57534b));
        const auto c = corner->getBounds().toFloat();
        for (int i = 1; i <= 3; ++i)
            g.drawLine (c.getRight() - 4.0f * (float) i, c.getBottom() - 1.0f, c.getRight() - 1.0f, c.getBottom() - 4.0f * (float) i, 1.0f);
    }
}

void SsbEditor::pushState()
{
    // the host restored a session while the window was open: the page takes the instance's settings
    browser.emitEventIfBrowserIsVisible ("ssbState", juce::var (plugin.pageState));
}

void SsbEditor::toggleZoom()
{
    const auto* display = juce::Desktop::getInstance().getDisplays().getDisplayForRect (getScreenBounds());
    if (display == nullptr)
        return;
    if (! unzoomed.isEmpty())
    {
        setSize (unzoomed.getWidth(), unzoomed.getHeight());
        unzoomed = {};
        return;
    }
    // The host owns the window and its position, so grow from where the editor sits to the
    // screen's usable edge; hosts that allow plugin resizing follow.
    const auto area = display->userBounds.toNearestInt();
    const auto at = getScreenBounds();
    unzoomed = getLocalBounds();
    setSize (juce::jmax (getWidth(), area.getRight() - at.getX()), juce::jmax (getHeight(), area.getBottom() - at.getY()));
}

void SsbEditor::resized()
{
    if (corner)
    {
        const auto b = getLocalBounds();
        browser.setBounds (b.withTrimmedRight (grip).withTrimmedBottom (grip));
        rightEdge->setBounds (b.getRight() - grip, 0, grip, b.getHeight() - 14);
        bottomEdge->setBounds (0, b.getBottom() - grip, b.getWidth() - 14, grip);
        corner->setBounds (b.getRight() - 14, b.getBottom() - 14, 14, 14);
    }
    else
        browser.setBounds (getLocalBounds());
    if (sized)
    {
        plugin.editorWidth = getWidth();
        plugin.editorHeight = getHeight();
    }
}

void SsbEditor::timerCallback()
{
    // the engine's output level for the page's VU meter, ~30 times a second
    if (plugin.usesEngine && ++meterTick >= 8)
    {
        meterTick = 0;
        auto* m = new juce::DynamicObject();
        m->setProperty ("l", plugin.engine.peak (0));
        m->setProperty ("r", plugin.engine.peak (1));
        m->setProperty ("voices", plugin.engine.activeVoices());
        if (const auto bpm = plugin.hostBpm.load(); bpm > 0)
        {
            auto* host = new juce::DynamicObject();
            host->setProperty ("bpm", bpm);
            host->setProperty ("ppq", plugin.hostPpq.load());
            host->setProperty ("playing", plugin.hostPlaying.load());
            m->setProperty ("host", juce::var (host));
        }

        // what is playing, for the pads' LEDs, progress rings and waveform playheads
        std::vector<ssb::VoiceView> views;
        double time = 0;
        if (plugin.engine.readVoices (views, time))
        {
            juce::Array<juce::var> list;
            for (const auto& v : views)
            {
                auto* o = new juce::DynamicObject();
                o->setProperty ("id", (juce::int64) v.id);
                o->setProperty ("sound", plugin.library.idFor (v.sound));
                if (v.group) o->setProperty ("group", plugin.library.idFor (v.group));
                if (v.midiNote >= 0) o->setProperty ("note", v.midiNote);
                o->setProperty ("age", v.age);
                o->setProperty ("end", v.end);
                o->setProperty ("pos", v.position);
                o->setProperty ("rate", v.rate);
                o->setProperty ("dur", v.duration);
                o->setProperty ("in", v.clipIn);
                o->setProperty ("out", v.clipOut);
                o->setProperty ("loops", v.loops);
                list.add (juce::var (o));
            }
            m->setProperty ("list", list);
            m->setProperty ("time", time);
        }
        browser.emitEventIfBrowserIsVisible ("ssbMeter", juce::var (m));
    }

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
