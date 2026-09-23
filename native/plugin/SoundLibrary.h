#pragma once

#include <ssb/Engine.h>
#include <ssb/ModelJson.h>

#include <juce_core/juce_core.h>

#include <map>
#include <mutex>
#include <set>

namespace ssb
{

/**
    Decoded samples by audioId, shared by every SSB instance in the process, and mirrored to a
    disk cache so a session reopened in a DAW can play before its editor (the page) ever loads.

    ~/Library/Application Support/WaveContour/SSB/samples (macOS), %APPDATA%\WaveContour\SSB\samples
    (Windows). One file per audioId: "SSBF", version, rate, channels, frames, planar float32.
*/
class SampleStore
{
public:
    static SampleStore& instance();

    /** In memory, else from the disk cache, else null. */
    SamplePtr get (const std::string& audioId);

    /** Keep a sample the page sent, in memory and (in the background) on disk. */
    void put (const std::string& audioId, SamplePtr sample);

    static juce::File cacheDirectory();

private:
    std::mutex lock;
    std::map<std::string, SamplePtr> memory;
    std::set<std::string> absent;   // looked for on disk and not there (until put)
    juce::ThreadPool writer { 1 };
};

/**
    The page's sounds and settings, as the engine needs them. The page pushes changes through the
    editor (sounds as JSON, the performance meta, samples); every change rebuilds the engine's
    Performance. Its state (everything but the samples) is saved with the host session.
*/
class SoundLibrary
{
public:
    explicit SoundLibrary (Engine& e) : engine (e) {}

    /** Add or replace sounds: an array of { id, audioId, s, zones?, links?, ccDefaults? }. */
    void setSounds (const juce::var& sounds);

    /** The performance meta; its "ids" (every sound the board has) drops the others. */
    void setMeta (const juce::var& meta);

    /** A sample from the page. */
    void addSample (const std::string& audioId, SamplePtr sample);

    /** audioIds some sound needs that neither memory nor the disk cache has. */
    juce::StringArray missingAudio();

    juce::String saveState();
    void restoreState (const juce::String& json);

private:
    void rebuild();

    Engine& engine;
    std::recursive_mutex lock;
    std::map<std::string, juce::var> soundJson;
    std::map<std::string, std::shared_ptr<Sound>> sounds;
    juce::var meta;
};

} // namespace ssb
