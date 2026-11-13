#include "SoundHost.h"
#include "McpCommon.h"

#if JUCE_MAC || JUCE_LINUX
 #include <signal.h>
 #include <fcntl.h>
 #include <spawn.h>
 #include <sys/wait.h>
 #include <unistd.h>
 extern char** environ;
#endif
#if JUCE_MAC
 #include <libproc.h>
#endif

namespace ssb
{

namespace
{
    constexpr int downloadChunk = 1 << 20;
    constexpr int loadTimeoutMs = 15 * 60 * 1000;      // a cold load of a large model from a slow disk
    constexpr int generateTimeoutMs = 30 * 60 * 1000;  // many steps on a slow machine

    /** $SSB_SOUND_DIR, for tests; else Application Support/WaveContour/SSB/sound */
    juce::File soundDirectory()
    {
        const auto env = juce::SystemStats::getEnvironmentVariable ("SSB_SOUND_DIR", {});
        return env.isNotEmpty() ? juce::File (env) : mcp::supportDirectory().getChildFile ("sound");
    }
    juce::File helperLog()      { return soundDirectory().getChildFile ("server.log"); }
    juce::File helperPidFile()  { return soundDirectory().getChildFile ("server.pid"); }
    juce::File helperConfig()   { return soundDirectory().getChildFile ("server.json"); }

    /** a path inside the model's folder, never outside it */
    juce::File inside (const juce::File& root, const juce::String& relative)
    {
        const auto f = root.getChildFile (relative);
        return f.isAChildOf (root) ? f : juce::File();
    }

    juce::String lastLines (const juce::File& f, int n)
    {
        juce::StringArray lines;
        lines.addLines (f.loadFileAsString());
        lines.removeEmptyStrings();
        juce::StringArray keep;
        for (int i = juce::jmax (0, lines.size() - n); i < lines.size(); ++i)
            keep.add (lines[i]);
        return keep.joinIntoString ("\n");
    }

    /** a free TCP port on 127.0.0.1 */
    int freePort()
    {
        juce::StreamingSocket s;
        if (s.createListener (0, "127.0.0.1"))
        {
            const auto p = s.getBoundPort();
            s.close();
            return p;
        }
        return 7873;
    }

    juce::int64 now() { return juce::Time::currentTimeMillis(); }

    juce::String backendName()
    {
       #if JUCE_MAC
        return "metal";
       #else
        return "cpu";
       #endif
    }
}

// ── the helper process ──

class SoundHost::Process
{
public:
   #if JUCE_MAC || JUCE_LINUX
    bool start (const juce::StringArray& args)
    {
        std::vector<std::string> owned;
        for (const auto& a : args)
            owned.push_back (a.toStdString());
        std::vector<char*> argv;
        for (auto& a : owned)
            argv.push_back (a.data());
        argv.push_back (nullptr);
        posix_spawn_file_actions_t actions;
        posix_spawn_file_actions_init (&actions);
        // its own log file has what matters; a pipe nobody reads would fill and stall it
        posix_spawn_file_actions_addopen (&actions, 1, "/dev/null", O_WRONLY, 0);
        posix_spawn_file_actions_addopen (&actions, 2, "/dev/null", O_WRONLY, 0);
        const auto r = posix_spawn (&pid, argv[0], &actions, nullptr, argv.data(), environ);
        posix_spawn_file_actions_destroy (&actions);
        if (r != 0)
            pid = 0;
        return pid > 0;
    }
    bool isRunning()
    {
        if (pid <= 0)
            return false;
        int st = 0;
        if (waitpid (pid, &st, WNOHANG) == pid)
            pid = 0;   // reaped: it's gone
        return pid > 0;
    }
    void kill()
    {
        if (pid <= 0)
            return;
        ::kill (pid, SIGTERM);
        for (int i = 0; i < 50 && isRunning(); ++i)
            juce::Thread::sleep (100);
        if (isRunning())
        {
            ::kill (pid, SIGKILL);
            waitpid (pid, nullptr, 0);
        }
        pid = 0;
    }
    int getPID() const { return (int) pid; }

private:
    pid_t pid = 0;
   #else
    bool start (const juce::StringArray& args) { return child.start (args, 0); }
    bool isRunning() { return child.isRunning(); }
    void kill()
    {
        child.kill();
        child.waitForProcessToFinish (5000);
    }
    int getPID() const { return 0; }

private:
    juce::ChildProcess child;
   #endif
};

// ── specs ──

SoundModelSpec SoundModelSpec::fromVar (const juce::var& v)
{
    SoundModelSpec s;
    s.id = v.getProperty ("id", "").toString();
    s.label = v.getProperty ("label", s.id).toString();
    s.family = v.getProperty ("family", "").toString();
    s.task = v.getProperty ("task", "gen").toString();
    s.main = v.getProperty ("main", "").toString();
    s.token = v.getProperty ("token", "").toString();
    if (auto* files = v.getProperty ("files", {}).getArray())
        for (const auto& f : *files)
            s.files.add ({ f.getProperty ("url", "").toString(), f.getProperty ("path", "").toString(), (juce::int64) f.getProperty ("bytes", 0) });
    // an id is a folder name: nothing that could climb out of the models folder
    s.id = s.id.retainCharacters ("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.").trimCharactersAtStart (".");
    return s;
}

juce::int64 SoundModelSpec::totalBytes() const
{
    juce::int64 t = 0;
    for (const auto& f : files)
        t += f.bytes;
    return t;
}

// ── the host ──

SoundHost::SoundHost()
{
    soundDirectory().createDirectory();
}

SoundHost::~SoundHost()
{
    cancelling = true;
    joinWorker();
    if (generator.joinable())
        generator.join();
    stopHelper();
}

juce::File SoundHost::modelsDirectory() { return soundDirectory().getChildFile ("models"); }

juce::File SoundHost::helperBinary()
{
    // $SSB_SOUND_HELPER, for tests (which aren't in a bundle)
    if (const auto env = juce::SystemStats::getEnvironmentVariable ("SSB_SOUND_HELPER", {}); env.isNotEmpty())
        return juce::File (env);
    const auto binary = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
   #if JUCE_WINDOWS
    return binary.getSiblingFile ("audiocpp_server.exe");
   #else
    // Contents/MacOS/<binary> -> Contents/Helpers/audiocpp_server
    return binary.getParentDirectory().getSiblingFile ("Helpers").getChildFile ("audiocpp_server");
   #endif
}

bool SoundHost::isDownloaded (const SoundModelSpec& s) const
{
    if (s.id.isEmpty() || s.files.isEmpty())
        return false;
    const auto root = modelsDirectory().getChildFile (s.id);
    for (const auto& f : s.files)
    {
        const auto file = inside (root, f.path);
        if (file == juce::File() || ! file.existsAsFile() || (f.bytes > 0 && file.getSize() != f.bytes))
            return false;
    }
    return true;
}

juce::var SoundHost::check (const juce::Array<SoundModelSpec>& specs) const
{
    juce::Array<juce::var> out;
    for (const auto& s : specs)
    {
        const auto root = modelsDirectory().getChildFile (s.id);
        juce::int64 missing = 0;
        for (const auto& f : s.files)
        {
            const auto file = inside (root, f.path);
            const auto have = file.existsAsFile() ? file.getSize() : file.withFileExtension (file.getFileExtension() + ".part").getSize();
            if (! (file.existsAsFile() && (f.bytes == 0 || have == f.bytes)))
                missing += juce::jmax ((juce::int64) 0, f.bytes - have);
        }
        auto* o = new juce::DynamicObject();
        o->setProperty ("id", s.id);
        o->setProperty ("downloaded", isDownloaded (s));
        o->setProperty ("missing", missing);
        out.add (juce::var (o));
    }
    return out;
}

juce::var SoundHost::status() const
{
    const juce::ScopedLock sl (lock);
    auto* o = new juce::DynamicObject();
    o->setProperty ("available", helperBinary().existsAsFile());
    o->setProperty ("backend", backendName());
    const bool running = helper != nullptr && helper->isRunning();
    o->setProperty ("helper", running ? (loadedId.isNotEmpty() ? "running" : "starting") : "stopped");
    if (running && loadedId.isNotEmpty())
    {
        auto* l = new juce::DynamicObject();
        l->setProperty ("id", loadedId);
        l->setProperty ("label", loadedLabel);
        l->setProperty ("family", loadedSpec.family);
        l->setProperty ("loadSeconds", loadSeconds);
        o->setProperty ("loaded", juce::var (l));
    }
    if (task)
    {
        auto* t = new juce::DynamicObject();
        t->setProperty ("kind", task->kind);
        t->setProperty ("model", task->model);
        t->setProperty ("message", task->message);
        t->setProperty ("done", task->done);
        t->setProperty ("total", task->total);
        t->setProperty ("progress", task->progress < 0 ? juce::var() : juce::var (task->progress));
        t->setProperty ("elapsed", (double) (now() - task->started) / 1000.0);
        o->setProperty ("task", juce::var (t));
    }
    if (errorMessage.isNotEmpty())
    {
        auto* e = new juce::DynamicObject();
        e->setProperty ("model", errorModel);
        e->setProperty ("message", errorMessage);
        o->setProperty ("error", juce::var (e));
    }
    o->setProperty ("modelsDir", modelsDirectory().getFullPathName());
    return juce::var (o);
}

void SoundHost::setTask (const Task& t)
{
    const juce::ScopedLock sl (lock);
    task = t;
}

void SoundHost::clearTask()
{
    const juce::ScopedLock sl (lock);
    task.reset();
}

void SoundHost::fail (const juce::String& model, const juce::String& message)
{
    const juce::ScopedLock sl (lock);
    errorModel = model;
    errorMessage = message;
}

void SoundHost::joinWorker()
{
    if (worker.joinable())
        worker.join();
}

juce::String SoundHost::load (const SoundModelSpec& s) { return startJob (s, true); }
juce::String SoundHost::download (const SoundModelSpec& s) { return startJob (s, false); }

juce::String SoundHost::startJob (const SoundModelSpec& s, bool thenLoad)
{
    if (s.id.isEmpty() || s.files.isEmpty() || s.main.isEmpty())
        return "not a sound model: it has no id, files or main file";
    if (thenLoad && ! helperBinary().existsAsFile())
        return "this build of SSB doesn't carry the sound model helper (audiocpp_server)";
    {
        const juce::ScopedLock sl (lock);
        if (task)
            return "busy: " + task->kind + " " + task->model;
        if (thenLoad && loadedId == s.id && helper && helper->isRunning())
            return {};
        errorModel.clear();
        errorMessage.clear();
        task = Task { "download", s.id, "checking", 0, s.totalBytes(), 0.0, now() };
    }
    joinWorker();
    cancelling = false;
    worker = std::thread ([this, s, thenLoad] { runJob (s, thenLoad); });
    return {};
}

void SoundHost::runJob (SoundModelSpec s, bool thenLoad)
{
    if (! downloadAll (s))
    {
        clearTask();
        return;
    }
    if (thenLoad && ! cancelling)
    {
        const auto started = now();
        setTask ({ "load", s.id, "loading on " + backendName(), 0, 0, -1.0, started });
        if (startHelper (s))
        {
            const juce::ScopedLock sl (lock);
            loadSeconds = (double) (now() - started) / 1000.0;
        }
    }
    clearTask();
}

bool SoundHost::downloadAll (const SoundModelSpec& s)
{
    const auto total = s.totalBytes();
    juce::int64 done = 0;
    const auto root = modelsDirectory().getChildFile (s.id);
    for (const auto& f : s.files)
    {
        if (cancelling)
        {
            fail (s.id, "cancelled");
            return false;
        }
        const auto file = inside (root, f.path);
        if (file == juce::File())
        {
            fail (s.id, "a file path leaves the model's folder: " + f.path);
            return false;
        }
        if (file.existsAsFile() && (f.bytes == 0 || file.getSize() == f.bytes))
        {
            done += f.bytes;
            continue;
        }
        if (! downloadFile (s, f, done, total))
            return false;
        done += f.bytes;
    }
    return true;
}

bool SoundHost::downloadFile (const SoundModelSpec& s, const SoundFile& f, juce::int64 doneBefore, juce::int64 total)
{
    const auto file = inside (modelsDirectory().getChildFile (s.id), f.path);
    const auto part = file.withFileExtension (file.getFileExtension() + ".part");
    file.getParentDirectory().createDirectory();
    auto have = part.getSize();
    if (f.bytes > 0 && have > f.bytes)
    {
        part.deleteFile();
        have = 0;
    }

    juce::String headers = "User-Agent: SSB\r\n";
    if (have > 0)
        headers << "Range: bytes=" << have << "-\r\n";
    if (s.token.isNotEmpty())
        headers << "Authorization: Bearer " << s.token << "\r\n";

    int status = 0;
    auto in = juce::URL (f.url).createInputStream (juce::URL::InputStreamOptions (juce::URL::ParameterHandling::inAddress)
                                                       .withExtraHeaders (headers)
                                                       .withConnectionTimeoutMs (30000)
                                                       .withNumRedirectsToFollow (10)
                                                       .withStatusCode (&status));
    if (in == nullptr || status == 0)
    {
        fail (s.id, "couldn't reach " + juce::URL (f.url).getDomain() + ": check the connection");
        return false;
    }
    if (status == 401 || status == 403)
    {
        fail (s.id, s.label + " is gated: sign in to Hugging Face, accept its licence on its page, and give SSB a Hugging Face token (AI settings)");
        return false;
    }
    if (status == 416 && have > 0)   // the part is already whole
        return part.moveFileTo (file);
    if (status >= 400)
    {
        fail (s.id, "download failed (HTTP " + juce::String (status) + "): " + f.path);
        return false;
    }
    if (status == 200 && have > 0)   // the server ignored the range: start over
    {
        part.deleteFile();
        have = 0;
    }

    {
        juce::FileOutputStream out (part);   // appends to what's there
        if (! out.openedOk())
        {
            fail (s.id, "can't write " + part.getFullPathName());
            return false;
        }
        juce::HeapBlock<char> buf (downloadChunk);
        auto got = have;
        auto lastReport = (juce::int64) 0;
        while (! in->isExhausted())
        {
            if (cancelling)
            {
                fail (s.id, "cancelled");
                return false;   // the part stays: the next download resumes it
            }
            const auto n = in->read (buf.getData(), downloadChunk);
            if (n <= 0)
                break;
            if (! out.write (buf.getData(), (size_t) n))
            {
                fail (s.id, "can't write " + part.getFullPathName() + " (disk full?)");
                return false;
            }
            got += n;
            if (now() - lastReport > 250)
            {
                lastReport = now();
                const auto done = doneBefore + got;
                const juce::ScopedLock sl (lock);
                if (task)
                {
                    task->message = f.path;
                    task->done = done;
                    task->total = total;
                    task->progress = total > 0 ? (double) done / (double) total : -1.0;
                }
            }
        }
        out.flush();
    }
    if (f.bytes > 0 && part.getSize() != f.bytes)
    {
        fail (s.id, "the download of " + f.path + " stopped early (" + juce::String (part.getSize()) + " of "
                        + juce::String (f.bytes) + " bytes): try again, it resumes");
        return false;
    }
    if (! part.moveFileTo (file))
    {
        fail (s.id, "can't move " + part.getFileName() + " into place");
        return false;
    }
    return true;
}

juce::String SoundHost::remove (const SoundModelSpec& s)
{
    const juce::ScopedLock sl (lock);
    if (s.id.isEmpty())
        return "no model";
    if (loadedId == s.id)
        return "it's loaded: unload it first";
    if (task && task->model == s.id)
        return "it's busy";
    const auto dir = modelsDirectory().getChildFile (s.id);
    if (dir.isAChildOf (modelsDirectory()))
        dir.deleteRecursively();
    return {};
}

// ── the helper ──

void SoundHost::killStaleHelper()
{
   #if JUCE_MAC
    // a helper an earlier SSB left running (it crashed, or the DAW was killed) still holds its model's memory
    const auto pid = helperPidFile().loadFileAsString().trim().getIntValue();
    if (pid > 0)
    {
        char path[PROC_PIDPATHINFO_MAXSIZE] = {};
        if (proc_pidpath (pid, path, sizeof (path)) > 0 && juce::String (path).endsWith ("/audiocpp_server"))
            ::kill (pid, SIGKILL);
    }
   #endif
    helperPidFile().deleteFile();
}

bool SoundHost::startHelper (const SoundModelSpec& s)
{
    stopHelper();
    killStaleHelper();

    const auto root = modelsDirectory().getChildFile (s.id);
    const auto main = s.main == "." ? root : inside (root, s.main);   // "." : a model that loads from its folder
    if (main == juce::File() || ! main.exists())
    {
        fail (s.id, "its files aren't all there: download it again");
        return false;
    }

    // one model, loaded at start
    auto* model = new juce::DynamicObject();
    model->setProperty ("id", "sound");
    if (s.family.isNotEmpty())
        model->setProperty ("family", s.family);
    model->setProperty ("path", main.getFullPathName());
    model->setProperty ("task", s.task);
    model->setProperty ("mode", "offline");
    auto* cfg = new juce::DynamicObject();
    const int p = freePort();
    cfg->setProperty ("host", "127.0.0.1");
    cfg->setProperty ("port", p);
    cfg->setProperty ("backend", backendName());
    cfg->setProperty ("lazy_load", false);
    cfg->setProperty ("max_loaded_models", 1);
    cfg->setProperty ("max_request_body_bytes", 1 << 20);
    cfg->setProperty ("models", juce::Array<juce::var> { juce::var (model) });
    helperConfig().replaceWithText (juce::JSON::toString (juce::var (cfg)));
    helperLog().deleteFile();

    auto child = std::make_unique<Process>();
    const juce::StringArray args { helperBinary().getFullPathName(), "--config", helperConfig().getFullPathName(), "--no-ui",
                                   "--log", "--log-file", helperLog().getFullPathName() };
    if (! child->start (args))
    {
        fail (s.id, "couldn't start the sound model helper");
        return false;
    }
    {
        const juce::ScopedLock sl (lock);
        helper = std::move (child);
        port = p;
    }
    if (helper->getPID() > 0)
        helperPidFile().replaceWithText (juce::String (helper->getPID()));

    // up and loaded: /v1/models says so
    const auto started = now();
    for (;;)
    {
        if (cancelling)
        {
            stopHelper();
            fail (s.id, "cancelled");
            return false;
        }
        {
            const juce::ScopedLock sl (lock);
            if (! helper || ! helper->isRunning())
            {
                helper.reset();
                fail (s.id, "the helper stopped while loading it: " + lastLines (helperLog(), 3));
                return false;
            }
        }
        juce::String body;
        if (http ("GET", "/v1/models", {}, body, 2000) == 200)
        {
            const auto j = juce::JSON::parse (body);
            if (auto* data = j.getProperty ("data", {}).getArray())
                if (! data->isEmpty() && (bool) (*data)[0].getProperty ("loaded", false))
                    break;
        }
        if (now() - started > loadTimeoutMs)
        {
            stopHelper();
            fail (s.id, "loading it timed out");
            return false;
        }
        juce::Thread::sleep (250);
    }
    const juce::ScopedLock sl (lock);
    loadedId = s.id;
    loadedLabel = s.label;
    loadedSpec = s;
    return true;
}

void SoundHost::stopHelper()
{
    std::unique_ptr<Process> h;
    {
        const juce::ScopedLock sl (lock);
        h = std::move (helper);
        loadedId.clear();
        loadedLabel.clear();
        port = 0;
    }
    if (h != nullptr)
    {
        h->kill();
        helperPidFile().deleteFile();
    }
}

void SoundHost::unload()
{
    {
        const juce::ScopedLock sl (lock);
        if (task)
            return;   // a download or load finishes (or is cancelled) first; a generation needs the helper
    }
    stopHelper();
}

void SoundHost::cancel()
{
    juce::String kind;
    SoundModelSpec reload;
    {
        const juce::ScopedLock sl (lock);
        if (! task)
            return;
        kind = task->kind;
        reload = loadedSpec;
    }
    if (kind == "generate")
    {
        // audio.cpp can't stop a diffusion run part way: stop the helper, and load the model again
        stopHelper();
        if (generator.joinable())
            generator.join();
        startJob (reload, true);
        return;
    }
    cancelling = true;
}

// ── generating ──

void SoundHost::generate (const juce::var& request, std::function<void (juce::var)> done)
{
    auto reply = [done] (juce::var v) { juce::MessageManager::callAsync ([done, v] { done (v); }); };
    auto error = [reply] (const juce::String& m)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("error", m);
        reply (juce::var (o));
    };
    juce::String model;
    {
        const juce::ScopedLock sl (lock);
        if (task)
            return error ("busy: " + task->kind + " " + task->model);
        if (loadedId.isEmpty() || ! helper || ! helper->isRunning())
            return error ("no sound model is loaded: load one first");
        model = loadedId;
        task = Task { "generate", loadedId, "generating", 0, 0, -1.0, now() };
    }
    if (generator.joinable())
        generator.join();
    generator = std::thread ([this, request, model, reply, error]
    {
        auto* body = new juce::DynamicObject();
        body->setProperty ("model", "sound");
        body->setProperty ("request", request);
        juce::String response;
        const auto t0 = now();
        const auto status = http ("POST", "/v1/tasks/run", juce::JSON::toString (juce::var (body), true), response, generateTimeoutMs);
        clearTask();
        if (status < 0)
            return error ("the sound model helper stopped before it answered (cancelled, or it ran out of memory)");
        const auto j = juce::JSON::parse (response);
        if (status != 200)
            return error (j.getProperty ("error", {}).isObject() ? j["error"].getProperty ("message", response).toString()
                                                                 : j.getProperty ("error", response.substring (0, 400)).toString());
        auto* o = new juce::DynamicObject();
        o->setProperty ("audio", j.getProperty ("audio", ""));
        o->setProperty ("sample_rate", j.getProperty ("sample_rate", 0));
        o->setProperty ("channels", j.getProperty ("channels", 0));
        o->setProperty ("elapsed", (double) (now() - t0) / 1000.0);
        o->setProperty ("model", model);
        reply (juce::var (o));
    });
}

int SoundHost::http (const juce::String& method, const juce::String& path, const juce::String& body, juce::String& response, int timeoutMs) const
{
    int p;
    {
        const juce::ScopedLock sl (lock);
        p = port;
    }
    if (p <= 0)
        return -1;
    juce::StreamingSocket s;
    if (! s.connect ("127.0.0.1", p, 2000))
        return -1;
    const auto payload = body.toStdString();
    juce::String head;
    head << method << " " << path << " HTTP/1.1\r\nHost: 127.0.0.1:" << p << "\r\nConnection: close\r\n";
    if (method == "POST")
        head << "Content-Type: application/json\r\nContent-Length: " << (int) payload.size() << "\r\n";
    head << "\r\n";
    const auto h = head.toStdString();
    if (s.write (h.data(), (int) h.size()) != (int) h.size()
        || (! payload.empty() && s.write (payload.data(), (int) payload.size()) != (int) payload.size()))
        return -1;

    juce::MemoryOutputStream got;
    char buf[65536];
    const auto deadline = now() + timeoutMs;
    for (;;)
    {
        const int ready = s.waitUntilReady (true, 500);
        if (ready < 0)
            break;
        if (ready == 0)
        {
            if (now() > deadline || ! s.isConnected())
                return -1;
            continue;
        }
        const int n = s.read (buf, sizeof (buf), false);
        if (n <= 0)
            break;
        got.write (buf, (size_t) n);
    }
    const auto all = got.toString();
    const auto split = all.indexOf ("\r\n\r\n");
    if (split < 0)
        return -1;
    const auto headers = all.substring (0, split);
    auto content = all.substring (split + 4);
    if (headers.containsIgnoreCase ("transfer-encoding: chunked"))
    {
        juce::String joined;
        int at = 0;
        while (at < content.length())
        {
            const auto eol = content.indexOf (at, "\r\n");
            if (eol < 0)
                break;
            const auto size = content.substring (at, eol).getHexValue32();
            if (size <= 0)
                break;
            joined << content.substring (eol + 2, eol + 2 + size);
            at = eol + 2 + size + 2;
        }
        content = joined;
    }
    response = content;
    return headers.fromFirstOccurrenceOf (" ", false, false).getIntValue();
}

} // namespace ssb
