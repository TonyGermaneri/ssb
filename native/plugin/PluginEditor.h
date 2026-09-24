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

private:
    void timerCallback() override;
    std::optional<juce::WebBrowserComponent::Resource> provide (const juce::String& path);

    SsbProcessor& plugin;
    juce::WebBrowserComponent browser;

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
