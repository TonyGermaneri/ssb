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

SamplePtr SampleStore::get (const std::string& audioId)
{
    {
        std::lock_guard<std::mutex> g (lock);
        if (auto it = memory.find (audioId); it != memory.end())
            return it->second;
        if (absent.count (audioId))
            return nullptr;
    }
    juce::FileInputStream in (fileFor (audioId));
    SamplePtr loaded;
    if (in.openedOk() && in.readInt() == 0x46425353 /* "SSBF" */ && in.readInt() == 1)
    {
        auto s = std::make_shared<Sample>();
        s->rate = in.readDouble();
        const auto channels = in.readInt();
        const auto frames = in.readInt64();
        if (channels >= 1 && channels <= 2 && frames > 0 && frames < (juce::int64) 1 << 32)
        {
            s->channels.assign ((size_t) channels, std::vector<float> ((size_t) frames));
            bool ok = true;
            for (auto& ch : s->channels)
                ok = ok && in.read (ch.data(), (int) (ch.size() * sizeof (float))) == (int) (ch.size() * sizeof (float));
            if (ok) loaded = s;
        }
    }
    std::lock_guard<std::mutex> g (lock);
    if (loaded) memory[audioId] = loaded;
    else absent.insert (audioId);
    return loaded;
}

void SampleStore::put (const std::string& audioId, SamplePtr sample)
{
    if (! sample) return;
    {
        std::lock_guard<std::mutex> g (lock);
        memory[audioId] = sample;
        absent.erase (audioId);
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

// =================================================================================== library

void SoundLibrary::setSounds (const juce::var& list)
{
    std::lock_guard<std::recursive_mutex> g (lock);
    auto lookup = [] (const std::string& id) { return SampleStore::instance().get (id); };
    if (auto* arr = list.getArray())
        for (const auto& json : *arr)
        {
            const auto id = json.getProperty ("id", {}).toString().toStdString();
            if (id.empty()) continue;
            soundJson[id] = json;
            sounds[id] = soundFromJson (json, lookup);
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
    // re-resolve the sounds that use it
    auto lookup = [] (const std::string& id) { return SampleStore::instance().get (id); };
    bool changed = false;
    for (auto& [id, sound] : sounds)
    {
        bool uses = sound->audioId == audioId;
        for (const auto& z : sound->zones)
            uses = uses || z.audioId == audioId;
        if (! uses) continue;
        sound = soundFromJson (soundJson[id], lookup);
        changed = true;
    }
    if (changed) rebuild();
}

juce::StringArray SoundLibrary::missingAudio()
{
    std::lock_guard<std::recursive_mutex> g (lock);
    juce::StringArray missing;
    auto need = [&] (const std::string& id)
    {
        if (! id.empty() && ! SampleStore::instance().get (id))
            missing.addIfNotAlreadyThere (juce::String (id));
    };
    for (const auto& [id, s] : sounds)
    {
        if (s->zones.empty()) need (s->audioId);
        for (const auto& z : s->zones) need (z.audioId);
    }
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
