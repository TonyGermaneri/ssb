#pragma once

#include "PluginProcessor.h"
#include <juce_gui_extra/juce_gui_extra.h>

/**
    The editor is the web app, and only the web app: the page Vite built, served to the platform
    web view out of the bundle's own Resources (a juce:// origin, so IndexedDB works and the board
    persists). The C++ side adds only what a web view lacks -- MIDI from the host, a save dialog,
    and a way to open a link in the real browser. @see src/native/bridge.ts for the other half.
*/
class SsbEditor final : public juce::AudioProcessorEditor,
                        private juce::Timer
{
public:
    explicit SsbEditor (SsbProcessor&);
    ~SsbEditor() override;

    void resized() override;
    void paint (juce::Graphics&) override;

    /** Hand the page this instance's saved settings (after a late setStateInformation). */
    void pushState();

private:
    void timerCallback() override;
    /** who this is, for the MCP discovery file ("SSB AU in Ableton Live") */
    juce::String mcpName() const;
    /** copies the MCP bridge to its fixed place; its path, or "" if this build has none */
    juce::String installMcpBridge();
    std::optional<juce::WebBrowserComponent::Resource> provide (const juce::String& path);
    /** a cached sample for the page, as binary (rate, channels, frames, planar float32): "ssb-audio/<audioId>" */
    std::optional<juce::WebBrowserComponent::Resource> provideAudio (const juce::String& audioId);

    /** The page's samples on their way in, a chunk at a time (ssbAudioBegin / Chunk / End): each chunk's base64 is
        decoded on the sample store's worker threads, so no single call holds the message thread -- the host's. */
    struct Upload
    {
        std::shared_ptr<ssb::Sample> sample;
        std::shared_ptr<std::atomic<int>> pending = std::make_shared<std::atomic<int>> (0);
    };
    std::map<juce::String, Upload> uploads;
    /** lets work finished on a worker thread find out whether this editor still exists */
    std::shared_ptr<bool> alive = std::make_shared<bool> (true);

    SsbProcessor& plugin;
    juce::WebBrowserComponent browser;
    std::vector<ssb::GrainView> grainViews;   // reused by every meter tick
    bool scopeWanted { false };               // the page shows a live view (ssbScope)
    std::vector<float> scopeBlock;            // reused by every meter tick
    std::vector<int16_t> scopePcm;

    /** Held while a save dialog is open: it is asynchronous and outlives the call that opened it. */
    std::unique_ptr<juce::FileChooser> chooser;
    int meterTick { 0 };
    bool sized { false };

    /** In a DAW: resize handles along the right and bottom edges and in the corner. They sit
        beside the page, not on it -- the web view is a native view, drawn above anything JUCE
        paints, so a grip placed over it could never be reached. */
    static constexpr int grip = 6;
    std::unique_ptr<juce::ResizableEdgeComponent> rightEdge, bottomEdge;
    std::unique_ptr<juce::ResizableCornerComponent> corner;

    /** Zoom (the page's header double-click): fill the screen from where the window is, or back. */
    void toggleZoom();
    juce::Rectangle<int> unzoomed;   // until the constructor has set the saved size, resizes aren't the user's

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SsbEditor)
};
