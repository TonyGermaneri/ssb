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

private:
    void timerCallback() override;
    std::optional<juce::WebBrowserComponent::Resource> provide (const juce::String& path);

    SsbProcessor& plugin;
    juce::WebBrowserComponent browser;

    /** Held while a save dialog is open: it is asynchronous and outlives the call that opened it. */
    std::unique_ptr<juce::FileChooser> chooser;
    int meterTick { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SsbEditor)
};
