#include "SoundLibrary.h"

namespace ssb
{

// =================================================================================== samples

SampleStore& SampleStore::instance()
{
    static SampleStore store;
    return store;
}

juce::File SampleStore::cacheDirectory()
{
   #if JUCE_MAC
    const auto base = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory).getChildFile ("Application Support");
   #else
    const auto base = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory);
   #endif
    return base.getChildFile ("WaveContour").getChildFile ("SSB").getChildFile ("samples");
}

static juce::File fileFor (const std::string& audioId)
{
    return SampleStore::cacheDirectory().getChildFile (juce::File::createLegalFileName (audioId) + ".ssbf");
}

SamplePtr SampleStore::readFile (const std::string& audioId) const
{
    juce::FileInputStream in (fileFor (audioId));
    if (! in.openedOk() || in.readInt() != 0x46425353 /* "SSBF" */ || in.readInt() != 1)
        return nullptr;
    auto s = std::make_shared<Sample>();
    s->rate = in.readDouble();
    const auto channels = in.readInt();
    const auto frames = in.readInt64();
    if (channels < 1 || channels > 2 || frames <= 0 || frames >= (juce::int64) 1 << 32)
        return nullptr;
    s->channels.assign ((size_t) channels, std::vector<float> ((size_t) frames));
    for (auto& ch : s->channels)
        if (in.read (ch.data(), (int) (ch.size() * sizeof (float))) != (int) (ch.size() * sizeof (float)))
            return nullptr;
    return s;
}

SamplePtr SampleStore::peek (const std::string& audioId)
{
    std::lock_guard<std::mutex> g (lock);
    auto it = memory.find (audioId);
    return it == memory.end() ? nullptr : it->second;
}

SamplePtr SampleStore::get (const std::string& audioId)
{
    {
        std::lock_guard<std::mutex> g (lock);
        if (auto it = memory.find (audioId); it != memory.end())
            return it->second;
        if (absent.count (audioId))
            return nullptr;
    }
    auto loaded = readFile (audioId);
    std::lock_guard<std::mutex> g (lock);
    onDisk.erase (audioId);
    if (! loaded)
    {
        absent.insert (audioId);
        return nullptr;
    }
    // a load that raced it may have put it first: keep one copy
    auto [it, inserted] = memory.emplace (audioId, loaded);
    return it->second;
}

SampleStore::Where SampleStore::where (const std::string& audioId)
{
    {
        std::lock_guard<std::mutex> g (lock);
        if (memory.count (audioId)) return Where::memory;
        if (loading.count (audioId)) return Where::loading;
        if (absent.count (audioId)) return Where::absent;
        if (onDisk.count (audioId)) return Where::disk;
    }
    // a stat, once per id
    const bool there = fileFor (audioId).existsAsFile();
    std::lock_guard<std::mutex> g (lock);
    (there ? onDisk : absent).insert (audioId);
    return there ? Where::disk : Where::absent;
}

void SampleStore::prefetch (const std::vector<std::string>& audioIds)
{
    for (const auto& id : audioIds)
    {
        if (where (id) != Where::disk)
            continue;
        {
            std::lock_guard<std::mutex> g (lock);
            if (! loading.insert (id).second)
                continue;
        }
        loaders.addJob ([this, id]
        {
            const auto s = get (id);
            {
                std::lock_guard<std::mutex> g (lock);
                loading.erase (id);
            }
            if (s) arrived (id);
        });
    }
}

void SampleStore::arrived (const std::string& audioId)
{
    std::lock_guard<std::mutex> g (lock);
    fresh.push_back (audioId);
    if (telling)
        return;
    telling = true;
    // the listeners hear on the message thread, a batch at a time: a session's worth of samples arriving together
    // rebuilds each library once or twice, not once per sample
    juce::MessageManager::callAsync ([this]
    {
        std::vector<std::string> batch;
        std::vector<Listener> told;
        {
            std::lock_guard<std::mutex> g (lock);
            batch.swap (fresh);
            telling = false;
            for (auto& [h, l] : listeners)
                told.push_back (l);
        }
        for (auto& l : told)
            l (batch);
    });
}

int SampleStore::addListener (Listener listener)
{
    std::lock_guard<std::mutex> g (lock);
    const auto h = nextListener++;
    listeners[h] = std::move (listener);
    return h;
}

void SampleStore::removeListener (int handle)
{
    std::lock_guard<std::mutex> g (lock);
    listeners.erase (handle);
}

void SampleStore::put (const std::string& audioId, SamplePtr sample)
{
    if (! sample) return;
    {
        std::lock_guard<std::mutex> g (lock);
        // what no sound holds any more (only this map does) leaves memory: a garden growing for hours sends a new
        // sample every few loops, and the disk keeps them for a session reopened
        const auto now = juce::Time::getMillisecondCounter();
        for (auto it = memory.begin(); it != memory.end();)
        {
            const auto at = putAt.find (it->first);
            const bool fresh = at != putAt.end() && now - at->second < 10000;
            if (it->second.use_count() == 1 && ! fresh)
            {
                if (at != putAt.end()) putAt.erase (at);
                it = memory.erase (it);
            }
            else
                ++it;
        }
        memory[audioId] = sample;
        putAt[audioId] = now;
        absent.erase (audioId);
        onDisk.erase (audioId);
    }
    writer.addJob ([audioId, sample]
    {
        const auto file = fileFor (audioId);
        if (file.existsAsFile()) return;
        file.getParentDirectory().createDirectory();
        const auto temp = file.getSiblingFile (file.getFileName() + ".part");
        {
            juce::FileOutputStream out (temp);
            if (! out.openedOk()) return;
            out.setPosition (0);
            out.truncate();
            out.writeInt (0x46425353);
            out.writeInt (1);
            out.writeDouble (sample->rate);
            out.writeInt ((int) sample->channels.size());
            out.writeInt64 ((juce::int64) sample->frames());
            for (const auto& ch : sample->channels)
                out.write (ch.data(), ch.size() * sizeof (float));
        }
        temp.moveFileTo (file);   // whole files only: a half-written sample is never read
    });
}

void SampleStore::forget (const std::string& audioId)
{
    {
        std::lock_guard<std::mutex> g (lock);
        memory.erase (audioId);
        putAt.erase (audioId);
        onDisk.erase (audioId);
        absent.insert (audioId);
    }
    // after any write still queued for it
    writer.addJob ([audioId] { fileFor (audioId).deleteFile(); });
}

// =================================================================================== library

SoundLibrary::SoundLibrary (Engine& e) : engine (e)
{
    // samples read from the disk cache in the background: the sounds that use them, re-resolved, one rebuild
    listener = SampleStore::instance().addListener ([this] (const std::vector<std::string>& ids)
    {
        std::lock_guard<std::recursive_mutex> g (lock);
        if (resolveUsing (std::set<std::string> (ids.begin(), ids.end())))
            rebuild();
    });
}

SoundLibrary::~SoundLibrary()
{
    SampleStore::instance().removeListener (listener);
    cancelPendingUpdate();
}

std::vector<std::string> SoundLibrary::audioIdsOf (const Sound& s)
{
    std::vector<std::string> ids;
    if (! s.audioId.empty()) ids.push_back (s.audioId);
    for (const auto& z : s.zones)
        if (! z.audioId.empty()) ids.push_back (z.audioId);
    return ids;
}

std::shared_ptr<Sound> SoundLibrary::resolve (const juce::var& json)
{
    // only what's in memory now: the message thread never waits on the disk. What's missing is read in the
    // background and the sound re-resolved when it arrives (the listener above).
    std::vector<std::string> wanted;
    auto lookup = [&wanted] (const std::string& id)
    {
        auto s = SampleStore::instance().peek (id);
        if (! s && ! id.empty()) wanted.push_back (id);
        return s;
    };
    auto sound = soundFromJson (json, lookup);
    if (! wanted.empty())
        SampleStore::instance().prefetch (wanted);
    return sound;
}

bool SoundLibrary::resolveUsing (const std::set<std::string>& audioIds)
{
    bool changed = false;
    for (auto& [id, sound] : sounds)
    {
        bool uses = false;
        for (const auto& a : audioIdsOf (*sound))
            uses = uses || audioIds.count (a) > 0;
        if (! uses) continue;
        sound = resolve (soundJson[id]);
        changed = true;
    }
    return changed;
}

void SoundLibrary::setSounds (const juce::var& list)
{
    std::lock_guard<std::recursive_mutex> g (lock);
    if (auto* arr = list.getArray())
        for (const auto& json : *arr)
        {
            const auto id = json.getProperty ("id", {}).toString().toStdString();
            if (id.empty()) continue;
            soundJson[id] = json;
            sounds[id] = resolve (json);
        }
    rebuild();
}

void SoundLibrary::setMeta (const juce::var& next)
{
    std::lock_guard<std::recursive_mutex> g (lock);
    meta = next;
    if (auto* ids = next.getProperty ("ids", {}).getArray())
    {
        std::set<std::string> keep;
        for (const auto& id : *ids)
            keep.insert (id.toString().toStdString());
        for (auto it = sounds.begin(); it != sounds.end();)
        {
            if (keep.count (it->first)) { ++it; continue; }
            soundJson.erase (it->first);
            it = sounds.erase (it);
        }
    }
    rebuild();
}

void SoundLibrary::addSample (const std::string& audioId, SamplePtr sample)
{
    SampleStore::instance().put (audioId, sample);
    std::lock_guard<std::recursive_mutex> g (lock);
    // re-resolve the sounds that use it; a burst of uploads rebuilds once
    if (resolveUsing ({ audioId }))
        rebuildSoon();
}

void SoundLibrary::handleAsyncUpdate()
{
    std::lock_guard<std::recursive_mutex> g (lock);
    rebuild();
}

juce::StringArray SoundLibrary::missingAudio()
{
    std::lock_guard<std::recursive_mutex> g (lock);
    juce::StringArray missing;
    std::vector<std::string> fromDisk;
    auto need = [&] (const std::string& id)
    {
        if (id.empty()) return;
        switch (SampleStore::instance().where (id))
        {
            case SampleStore::Where::memory:
            case SampleStore::Where::loading: break;
            case SampleStore::Where::disk: fromDisk.push_back (id); break;
            case SampleStore::Where::absent: missing.addIfNotAlreadyThere (juce::String (id)); break;
        }
    };
    for (const auto& [id, s] : sounds)
    {
        // (a multi-sample sound plays its zones; its own audioId needn't exist)
        if (s->zones.empty()) need (s->audioId);
        for (const auto& z : s->zones) need (z.audioId);
    }
    SampleStore::instance().prefetch (fromDisk);
    return missing;
}

void SoundLibrary::rebuild()
{
    byHash.clear();
    for (const auto& [id, s] : sounds)
        byHash[idHash (id)] = id;
    engine.setPerformance (buildPerformance (meta, sounds));
}

juce::String SoundLibrary::idFor (uint64_t hash)
{
    std::lock_guard<std::recursive_mutex> g (lock);
    auto it = byHash.find (hash);
    return it == byHash.end() ? juce::String() : juce::String (it->second);
}

juce::String SoundLibrary::saveState()
{
    std::lock_guard<std::recursive_mutex> g (lock);
    auto* root = new juce::DynamicObject();
    root->setProperty ("meta", meta);
    juce::Array<juce::var> list;
    for (const auto& [id, json] : soundJson)
        list.add (json);
    root->setProperty ("sounds", list);
    return juce::JSON::toString (juce::var (root), true);
}

void SoundLibrary::restoreState (const juce::String& json)
{
    const auto root = juce::JSON::parse (json);
    if (! root.isObject()) return;
    std::lock_guard<std::recursive_mutex> g (lock);
    soundJson.clear();
    sounds.clear();
    setSounds (root.getProperty ("sounds", {}));
    setMeta (root.getProperty ("meta", {}));
}

} // namespace ssb
