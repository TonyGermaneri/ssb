// SSB's own standalone application (JUCE_USE_CUSTOM_PLUGIN_STANDALONE_APP), so the window can be
// what a desktop app's window should be: resizable from any edge, and a double-click on the title
// bar (or its maximise button) fills the screen and restores it again. JUCE's stock standalone
// window offers only minimise and close, and opens at the editor's size, whatever that is.
//
// Compiled into every format's shared code; only the standalone wrapper ever asks for it.

#include <juce_core/system/juce_TargetPlatform.h>

#if JucePlugin_Build_Standalone && JUCE_USE_CUSTOM_PLUGIN_STANDALONE_APP

#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_audio_plugin_client/Standalone/juce_StandaloneFilterWindow.h>

namespace
{

class SsbWindow final : public juce::StandaloneFilterWindow
{
public:
    explicit SsbWindow (std::unique_ptr<juce::StandalonePluginHolder> holder)
        : StandaloneFilterWindow ("Super Sound Board", juce::Colour (0xff121114), std::move (holder))
    {
        // Maximise too: DocumentWindow turns a title-bar double-click into a maximise click.
        setTitleBarButtonsRequired (DocumentWindow::minimiseButton | DocumentWindow::maximiseButton
                                        | DocumentWindow::closeButton,
                                    false);
        // Not the corner grip: every edge and corner resizes.
        setResizable (true, false);

        // The first launch opens at a size that shows the board (later ones remember theirs:
        // the editor keeps its size in the plugin state).
        if (auto* props = pluginHolder->settings.get(); props && ! props->containsKey ("windowX"))
        {
            const auto area = juce::Desktop::getInstance().getDisplays().getPrimaryDisplay()->userBounds.toNearestInt();
            centreWithSize (juce::jmin (1600, area.getWidth() - 40), juce::jmin (1000, area.getHeight() - 40));
        }
    }

    /** Zoom: fill the usable area of the screen the window is on (not a macOS full-screen space,
        which a window with a drawn title bar cannot enter), or go back to where it was. */
    void maximiseButtonPressed() override
    {
        const auto& displays = juce::Desktop::getInstance().getDisplays();
        const auto* display = displays.getDisplayForRect (getScreenBounds());
        if (display == nullptr)
            return;
        const auto screen = display->userBounds.toNearestInt();
        if (zoomed && ! restoreBounds.isEmpty())
        {
            zoomed = false;
            setBounds (restoreBounds);
        }
        else
        {
            restoreBounds = getBounds();
            zoomed = true;
            setBounds (screen);
        }
    }

private:
    bool zoomed { false };
    juce::Rectangle<int> restoreBounds;
};

class SsbStandaloneApp final : public juce::JUCEApplication
{
public:
    SsbStandaloneApp()
    {
        juce::PropertiesFile::Options options;
        options.applicationName = JucePlugin_Name;
        options.filenameSuffix = ".settings";
        options.osxLibrarySubFolder = "Application Support";
       #if JUCE_LINUX || JUCE_BSD
        options.folderName = "~/.config";
       #endif
        properties.setStorageParameters (options);
    }

    const juce::String getApplicationName() override { return JucePlugin_Name; }
    const juce::String getApplicationVersion() override { return JucePlugin_VersionString; }
    bool moreThanOneInstanceAllowed() override { return true; }
    void anotherInstanceStarted (const juce::String&) override {}

    void initialise (const juce::String&) override
    {
        if (juce::Desktop::getInstance().getDisplays().displays.isEmpty())
            return;
        auto holder = std::make_unique<juce::StandalonePluginHolder> (properties.getUserSettings(), false);
        window = std::make_unique<SsbWindow> (std::move (holder));
        window->setVisible (true);
    }

    void shutdown() override
    {
        window = nullptr;
        properties.saveIfNeeded();
    }

    void systemRequestedQuit() override
    {
        if (window != nullptr)
            window->pluginHolder->savePluginState();
        if (juce::ModalComponentManager::getInstance()->cancelAllModalComponents())
            juce::Timer::callAfterDelay (100, [] { if (auto* app = JUCEApplicationBase::getInstance()) app->systemRequestedQuit(); });
        else
            quit();
    }

private:
    juce::ApplicationProperties properties;
    std::unique_ptr<SsbWindow> window;
};

} // namespace

juce::JUCEApplicationBase* juce_CreateApplication();
juce::JUCEApplicationBase* juce_CreateApplication() { return new SsbStandaloneApp(); }

#endif
