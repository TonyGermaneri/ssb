#pragma once

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>
#include <atomic>
#include <functional>
#include <memory>
#include <thread>

namespace ssb
{

/** One file of a sound model: where it comes from, where it goes (relative to the model's folder), its size. */
struct SoundFile
{
    juce::String url, path;
    juce::int64 bytes = 0;
};

/**
    A sound model as the page describes it (src/lib/ai/soundModels.ts holds the catalog): the files
    to download, and how audio.cpp loads it -- its family, task, and the file (or folder) it loads.
*/
struct SoundModelSpec
{
    juce::String id, label, family, task { "gen" }, main;
    juce::Array<SoundFile> files;
    juce::String token;   // a Hugging Face token, for gated files (Stable Audio Open)

    static SoundModelSpec fromVar (const juce::var&);
    juce::int64 totalBytes() const;
};

/**
    The sound models' host: text-to-audio models (MOSS-SoundEffect v2, Stable Audio) run by audio.cpp
    in a helper process this bundle carries (Contents/Helpers/audiocpp_server), out of the DAW's
    process -- a model is several GB of (GPU) memory, and a crash in it must not take a session down.

    One helper holds one model: loading starts it with that model, unloading or cancelling stops it,
    which frees everything. SoundHost downloads the models (resumably, into Application Support),
    starts and stops the helper, and runs generations against it over HTTP on 127.0.0.1 (a raw socket:
    a plugin lives in the host's process, under the host's App Transport Security).

    Shared by every SSB instance in a process (juce::SharedResourcePointer): one helper, one model,
    whichever editor asks. Its jobs run on their own threads; status() is a snapshot for the page.
*/
class SoundHost
{
public:
    SoundHost();
    ~SoundHost();

    /** { available, helper, loaded, task, error } -- what the page polls */
    juce::var status() const;
    /** for each spec: { id, downloaded, missing } */
    juce::var check (const juce::Array<SoundModelSpec>&) const;

    /** download what's missing, then load it (an error string if busy) */
    juce::String load (const SoundModelSpec&);
    /** download only */
    juce::String download (const SoundModelSpec&);
    void unload();
    /** stop the download, load or generation under way (a generation stops the helper; the model reloads) */
    void cancel();
    /** delete a downloaded model's files (not the loaded one) */
    juce::String remove (const SoundModelSpec&);

    /** one clip: `request` is audio.cpp's {text, seed, options}; `done` gets { audio (base64 WAV), sample_rate,
        channels, elapsed, model } or { error }, on the message thread */
    void generate (const juce::var& request, std::function<void (juce::var)> done);

    static juce::File modelsDirectory();
    static juce::File helperBinary();
    bool isDownloaded (const SoundModelSpec&) const;

private:
    struct Task
    {
        juce::String kind, model, message;
        juce::int64 done = 0, total = 0;
        double progress = -1.0;   // -1: can't tell
        juce::int64 started = 0;
    };

    juce::String startJob (const SoundModelSpec&, bool thenLoad);
    void runJob (SoundModelSpec, bool thenLoad);
    bool downloadAll (const SoundModelSpec&);
    bool downloadFile (const SoundModelSpec&, const SoundFile&, juce::int64 doneBefore, juce::int64 total);
    bool startHelper (const SoundModelSpec&);
    void stopHelper();
    void killStaleHelper();
    void setTask (const Task&);
    void clearTask();
    void fail (const juce::String& model, const juce::String& message);
    void joinWorker();

    /** one HTTP/1.1 request to the helper; status code, or -1 when it can't be reached */
    int http (const juce::String& method, const juce::String& path, const juce::String& body, juce::String& response, int timeoutMs) const;

    /** the helper process: posix_spawn on macOS / Linux (its pid, for cleaning up after a crash), JUCE's elsewhere */
    class Process;

    mutable juce::CriticalSection lock;
    std::unique_ptr<Process> helper;
    int port = 0;
    juce::String loadedId, loadedLabel;
    double loadSeconds = 0;
    SoundModelSpec loadedSpec;
    std::optional<Task> task;
    juce::String errorModel, errorMessage;
    std::atomic<bool> cancelling { false };
    std::thread worker;      // downloads and loads
    std::thread generator;   // generations

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SoundHost)
};

} // namespace ssb
