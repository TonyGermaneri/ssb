#pragma once

#include <ssb/Engine.h>
#include <ssb/ModelJson.h>

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

#include <functional>
#include <map>
#include <mutex>
#include <set>
#include <unordered_map>

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

    /** In memory, else null. Never touches the disk: what the message thread asks. */
    SamplePtr peek (const std::string& audioId);

    /** In memory, else from the disk cache (a whole file read: from a background thread, or for something rare). */
    SamplePtr get (const std::string& audioId);

    enum class Where { memory, loading, disk, absent };
    /** Where a sample is, without reading it (a file's existence, looked up once). */
    Where where (const std::string& audioId);

    /** Read these from the disk cache on the loader threads, in parallel; the listeners hear (on the message thread,
        coalesced) which arrived. Ones in memory, loading already or absent are skipped. */
    void prefetch (const std::vector<std::string>& audioIds);

    /** Told, on the message thread, the audioIds just read from disk. Returns a handle for removeListener. */
    using Listener = std::function<void (const std::vector<std::string>&)>;
    int addListener (Listener listener);
    void removeListener (int handle);

    /** Keep a sample the page sent, in memory and (in the background) on disk. Samples no sound holds any more
        leave memory as it does (they come back from disk if asked for again). */
    void put (const std::string& audioId, SamplePtr sample);

    /** A sample gone for good (the PROMPT GARDEN's old takes): out of memory and off the disk. */
    void forget (const std::string& audioId);

    /** The loader threads, for other work that mustn't hold the message thread (decoding the page's uploads). */
    juce::ThreadPool& workers() { return loaders; }

    static juce::File cacheDirectory();

private:
    SamplePtr readFile (const std::string& audioId) const;
    void arrived (const std::string& audioId);

    std::mutex lock;
    std::map<std::string, SamplePtr> memory;
    std::set<std::string> absent;   // looked for on disk and not there (until put)
    std::set<std::string> onDisk;   // known to be on disk (not yet read)
    std::set<std::string> loading;
    std::map<std::string, juce::uint32> putAt;   // when the page sent each (ms): a fresh one stays till its disk copy is surely written
    std::map<int, Listener> listeners;
    int nextListener = 1;
    std::vector<std::string> fresh;   // read since the listeners were last told
    bool telling = false;
    juce::ThreadPool writer { 1 };
    juce::ThreadPool loaders { juce::jlimit (2, 4, juce::SystemStats::getNumCpus() - 1) };
};

/**
    The page's sounds and settings, as the engine needs them. The page pushes changes through the
    editor (sounds as JSON, the performance meta, samples); every change rebuilds the engine's
    Performance. Its state (everything but the samples) is saved with the host session.
*/
class SoundLibrary : private juce::AsyncUpdater
{
public:
    explicit SoundLibrary (Engine& e);
    ~SoundLibrary() override;

    /** Add or replace sounds: an array of { id, audioId, s, zones?, links?, ccDefaults? }. */
    void setSounds (const juce::var& sounds);

    /** The performance meta; its "ids" (every sound the board has) drops the others. */
    void setMeta (const juce::var& meta);

    /** A sample from the page. */
    void addSample (const std::string& audioId, SamplePtr sample);

    /** audioIds some sound needs that neither memory nor the disk cache has (ones on disk are read in the
        background, not reported). */
    juce::StringArray missingAudio();

    /** The id an engine VoiceView names (by idHash), or empty. */
    juce::String idFor (uint64_t hash);

    juce::String saveState();
    void restoreState (const juce::String& json);

private:
    void rebuild();
    /** a rebuild on the message thread's next turn: a burst of samples arriving rebuilds once */
    void rebuildSoon() { triggerAsyncUpdate(); }
    void handleAsyncUpdate() override;
    /** the sounds that use any of these samples, re-resolved */
    bool resolveUsing (const std::set<std::string>& audioIds);
    /** a sound from its JSON, with what's in memory; the samples it lacks that are on disk, asked for */
    std::shared_ptr<Sound> resolve (const juce::var& json);
    /** every audioId a sound plays */
    static std::vector<std::string> audioIdsOf (const Sound& s);

    Engine& engine;
    std::recursive_mutex lock;
    std::map<std::string, juce::var> soundJson;
    std::map<std::string, std::shared_ptr<Sound>> sounds;
    std::unordered_map<uint64_t, std::string> byHash;
    juce::var meta;
    int listener = 0;
};

} // namespace ssb
