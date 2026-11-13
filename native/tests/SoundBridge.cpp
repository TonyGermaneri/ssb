// The page's `ssbSound` native function without the page's web view: SoundHost::call (what PluginEditor runs) over
// stdin / stdout, one JSON object a line. In: { "id": n, "args": { op, ... } }; out: { "id": n, "result": ... }.
// For the live test of the agent's sound tools (src/lib/ai/sound.live.test.ts), which drives the real host,
// helper and models through it.
//
//   SSB_SOUND_DIR=<dir> SSB_SOUND_HELPER=<build>/sound-helper/audiocpp_server ssb-sound-bridge

#include "SoundHost.h"
#include <atomic>
#include <cstdio>
#include <iostream>
#include <mutex>
#include <string>

int main()
{
    juce::MessageManager::getInstance()->setCurrentThreadAsMessageThread();   // generate answers on it
    ssb::SoundHost host;

    std::mutex out;
    std::atomic<int> pending { 0 };
    std::atomic<bool> eof { false };
    const auto send = [&out] (const juce::var& id, const juce::var& result)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("id", id);
        o->setProperty ("result", result);
        const std::lock_guard<std::mutex> g (out);
        std::fputs ((juce::JSON::toString (juce::var (o), true) + "\n").toRawUTF8(), stdout);
        std::fflush (stdout);
    };

    std::thread reader ([&]
    {
        std::string line;
        while (std::getline (std::cin, line))
        {
            const auto msg = juce::JSON::parse (juce::String (line));
            if (! msg.isObject())
                continue;
            ++pending;
            juce::MessageManager::callAsync ([&host, &send, &pending, msg]
            {
                const auto id = msg["id"];
                host.call (msg["args"], [&send, &pending, id] (juce::var r) { send (id, r); --pending; });
            });
        }
        eof = true;
    });

    while (! (eof && pending == 0))
        juce::MessageManager::getInstance()->runDispatchLoopUntil (50);
    reader.join();
    host.unload();
    return 0;
}
