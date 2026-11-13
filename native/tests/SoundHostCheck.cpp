// A live check of the sound models' host (plugin/SoundHost) against the real thing: a download from Hugging Face
// (resumed from a part file), audio.cpp's helper loading the model, a clip generated, a generation cancelled.
// Not part of `ctest`'s default run: it downloads 1.7 GB the first time and needs the GPU.
//
//   SSB_SOUND_DIR=<scratch dir> SSB_SOUND_HELPER=<build>/sound-helper/audiocpp_server ssb-sound-check
//
// SSB_SOUND_CHECK_MOSS=1 also loads MOSS-SoundEffect v2 (4.0 GB) and generates with it.

#include "SoundHost.h"
#include <cstdio>

namespace
{
int failures = 0;
#define CHECK(c) do { if (! (c)) { ++failures; std::printf ("FAIL %s:%d  %s\n", __FILE__, __LINE__, #c); } } while (0)

juce::var spec (const char* id, const char* label, const char* family, const char* file, const char* url, juce::int64 bytes)
{
    auto* f = new juce::DynamicObject();
    f->setProperty ("url", url);
    f->setProperty ("path", file);
    f->setProperty ("bytes", bytes);
    auto* m = new juce::DynamicObject();
    m->setProperty ("id", id);
    m->setProperty ("label", label);
    m->setProperty ("family", family);
    m->setProperty ("task", "gen");
    m->setProperty ("main", file);
    m->setProperty ("files", juce::Array<juce::var> { juce::var (f) });
    return juce::var (m);
}

juce::var status (ssb::SoundHost& h) { return h.status(); }

/** wait while the host works, printing its progress now and then */
bool waitIdle (ssb::SoundHost& h, int timeoutS)
{
    const auto t0 = juce::Time::getMillisecondCounter();
    juce::String last;
    for (;;)
    {
        const auto st = status (h);
        const auto task = st["task"];
        if (! task.isObject())
            return true;
        const auto line = task["kind"].toString() + " " + task["message"].toString() + " "
                        + (task["progress"].isVoid() ? juce::String() : juce::String ((double) task["progress"] * 100.0, 0) + "%");
        if (line != last && juce::Time::getMillisecondCounter() % 5000 < 300)
            std::printf ("  … %s\n", (last = line).toRawUTF8());
        if (juce::Time::getMillisecondCounter() - t0 > (juce::uint32) timeoutS * 1000)
            return false;
        juce::Thread::sleep (250);
    }
}

juce::var generate (ssb::SoundHost& h, const juce::String& text, double seconds, int steps, const char* stepsOption, int timeoutS)
{
    auto* opts = new juce::DynamicObject();
    opts->setProperty ("duration_sec", seconds);
    opts->setProperty (stepsOption, steps);
    auto* req = new juce::DynamicObject();
    req->setProperty ("text", text);
    req->setProperty ("seed", 7);
    req->setProperty ("options", juce::var (opts));
    juce::var result;
    bool done = false;
    h.generate (juce::var (req), [&] (juce::var r) { result = r; done = true; });
    const auto t0 = juce::Time::getMillisecondCounter();
    while (! done && juce::Time::getMillisecondCounter() - t0 < (juce::uint32) timeoutS * 1000)
        juce::MessageManager::getInstance()->runDispatchLoopUntil (100);
    return result;
}

/** the WAV in a result: its channels and length */
void checkClip (const juce::var& r, int rate, int channels, double seconds)
{
    CHECK (r["error"].isVoid());
    if (! r["error"].isVoid())
        std::printf ("  error: %s\n", r["error"].toString().toRawUTF8());
    juce::MemoryOutputStream wav;
    CHECK (juce::Base64::convertFromBase64 (wav, r["audio"].toString()));
    const auto* b = static_cast<const char*> (wav.getData());
    CHECK (wav.getDataSize() > 44 && juce::String (b, 4) == "RIFF");
    CHECK ((int) r["sample_rate"] == rate);
    CHECK ((int) r["channels"] == channels);
    const auto frames = (double) (wav.getDataSize() - 44) / (2.0 * channels);
    CHECK (std::abs (frames / rate - seconds) < 0.1);
    std::printf ("  clip: %.2f s, %d ch, %d Hz, in %.1f s\n", frames / rate, (int) r["channels"], (int) r["sample_rate"], (double) r["elapsed"]);
}
} // namespace

int main()
{
    juce::MessageManager::getInstance()->setCurrentThreadAsMessageThread();   // a message loop, for the generation's reply
    if (juce::SystemStats::getEnvironmentVariable ("SSB_SOUND_DIR", {}).isEmpty() || ! ssb::SoundHost::helperBinary().existsAsFile())
    {
        std::printf ("skipped: set SSB_SOUND_DIR (a scratch folder) and SSB_SOUND_HELPER (the built audiocpp_server)\n");
        return 0;
    }

    ssb::SoundHost host;
    const auto sfx = spec ("stable-audio-3-small-sfx-q8", "Stable Audio 3 Small SFX", "stable_audio", "stable-audio-3-small-sfx-q8_0.gguf",
                           "https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/main/Stable-Audio-3-Small-SFX-GGUF/stable-audio-3-small-sfx-q8_0.gguf",
                           1683576512);
    const auto s = ssb::SoundModelSpec::fromVar (sfx);

    std::printf ("download + load %s\n", s.label.toRawUTF8());
    CHECK (host.load (s).isEmpty());
    CHECK (host.load (s).startsWith ("busy"));   // one job at a time
    CHECK (waitIdle (host, 1800));
    auto st = status (host);
    CHECK (st["loaded"]["id"].toString() == s.id);
    if (st["error"].isObject())
        std::printf ("  error: %s\n", st["error"]["message"].toString().toRawUTF8());
    CHECK (host.isDownloaded (s));
    std::printf ("  loaded in %.1f s\n", (double) st["loaded"]["loadSeconds"]);

    std::printf ("generate\n");
    checkClip (generate (host, "a heavy steel door slams shut in a concrete hall", 3.0, 8, "num_inference_steps", 300), 44100, 2, 3.0);

    std::printf ("cancel a generation (the model reloads)\n");
    {
        auto* opts = new juce::DynamicObject();
        opts->setProperty ("duration_sec", 30.0);
        opts->setProperty ("num_inference_steps", 200);
        auto* req = new juce::DynamicObject();
        req->setProperty ("text", "a long rainstorm");
        req->setProperty ("options", juce::var (opts));
        juce::var result;
        bool done = false;
        host.generate (juce::var (req), [&] (juce::var r) { result = r; done = true; });
        juce::Thread::sleep (1500);
        host.cancel();
        const auto t0 = juce::Time::getMillisecondCounter();
        while (! done && juce::Time::getMillisecondCounter() - t0 < 30000)
            juce::MessageManager::getInstance()->runDispatchLoopUntil (100);
        CHECK (done && result["error"].isString());
        CHECK (waitIdle (host, 300));
        CHECK (status (host)["loaded"]["id"].toString() == s.id);
    }

    std::printf ("unload\n");
    host.unload();
    CHECK (! status (host)["loaded"].isObject());

    if (juce::SystemStats::getEnvironmentVariable ("SSB_SOUND_CHECK_MOSS", {}) == "1")
    {
        const auto moss = ssb::SoundModelSpec::fromVar (spec ("moss-soundeffect-v2-q8", "MOSS-SoundEffect v2", "moss_soundeffect", "moss-soundeffect-v2-q8_0.gguf",
            "https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/main/MOSS-SoundEffect-v2-GGUF/moss-soundeffect-v2-q8_0.gguf", 4001175520));
        std::printf ("download + load %s\n", moss.label.toRawUTF8());
        CHECK (host.load (moss).isEmpty());
        CHECK (waitIdle (host, 3600));
        CHECK (status (host)["loaded"]["id"].toString() == moss.id);
        std::printf ("generate (MOSS: about a second a step)\n");
        checkClip (generate (host, "a heavy wooden door creaks open slowly, then slams shut", 4.0, 20, "num_steps", 900), 48000, 1, 4.0);
        host.unload();
    }

    std::printf (failures ? "%d FAILED\n" : "ok\n", failures);
    return failures ? 1 : 0;
}
