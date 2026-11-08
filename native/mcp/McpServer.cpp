#include "McpServer.h"
#include "McpCommon.h"

#include <algorithm>
#include <cstring>

namespace ssb
{

namespace
{
constexpr int maxHeader = 16 * 1024;
constexpr int maxBody = 16 * 1024 * 1024;
/** a render can take a few seconds; an approval waits for the user */
constexpr int requestTimeoutMs = 300 * 1000;

const char* reason (int status)
{
    switch (status)
    {
        case 200: return "OK";
        case 202: return "Accepted";
        case 400: return "Bad Request";
        case 401: return "Unauthorized";
        case 403: return "Forbidden";
        case 404: return "Not Found";
        case 405: return "Method Not Allowed";
        case 413: return "Payload Too Large";
        case 415: return "Unsupported Media Type";
        case 503: return "Service Unavailable";
        case 504: return "Gateway Timeout";
        default:  return "Error";
    }
}

/** a JSON-RPC error with no request id (the transport refused it before anyone read it) */
juce::String rpcError (int code, const juce::String& message)
{
    auto* err = new juce::DynamicObject();
    err->setProperty ("code", code);
    err->setProperty ("message", message);
    auto* o = new juce::DynamicObject();
    o->setProperty ("jsonrpc", "2.0");
    o->setProperty ("id", juce::var());
    o->setProperty ("error", juce::var (err));
    return juce::JSON::toString (juce::var (o), true);
}

void respond (juce::StreamingSocket& s, int status, const juce::String& body, const juce::String& extraHeaders = {})
{
    const auto utf8 = body.toStdString();
    juce::String head;
    head << "HTTP/1.1 " << status << " " << reason (status) << "\r\n"
         << (utf8.empty() ? "" : "Content-Type: application/json\r\n")
         << "Content-Length: " << (int) utf8.size() << "\r\n"
         << "Cache-Control: no-store\r\n"
         << extraHeaders
         << "Connection: close\r\n\r\n";
    const auto out = head.toStdString() + utf8;
    // JUCE's non-blocking read leaves the socket non-blocking: a big answer (a render's pictures) fills the send
    // buffer and send() says "try again", so wait until it can take more
    int stalls = 0;
    for (size_t sent = 0; sent < out.size();)
    {
        if (s.waitUntilReady (false, 10000) != 1) return;
        const auto n = s.write (out.data() + sent, (int) std::min<size_t> (65536, out.size() - sent));
        if (n < 0)
        {
            if (++stalls > 200) return;
            juce::Thread::sleep (5);
            continue;
        }
        stalls = 0;
        sent += (size_t) n;
    }
}

/** Origins a page served from this machine can have; any other web page is refused (DNS rebinding) */
bool localOrigin (const juce::String& origin)
{
    for (auto* prefix : { "http://localhost", "https://localhost", "http://127.0.0.1", "https://127.0.0.1", "http://[::1]" })
        if (origin.startsWith (prefix))
        {
            const auto rest = origin.substring ((int) strlen (prefix));
            if (rest.isEmpty() || rest.startsWithChar (':') || rest.startsWithChar ('/')) return true;
        }
    return false;
}
} // namespace

McpServer::McpServer() : juce::Thread ("ssb mcp") {}

McpServer::~McpServer()
{
    stop();
}

McpServer::Status McpServer::start (int preferredPort, const juce::String& newToken, const juce::String& name)
{
    if (listener && newToken == token && (preferredPort == boundPort || preferredPort <= 0))
        return status();
    stop();
    token = newToken;
    auto socket = std::make_unique<juce::StreamingSocket>();
    const int first = juce::jlimit (1024, 65000, preferredPort > 0 ? preferredPort : 6280);
    int port = 0;
    for (int p = first; p < first + 10; ++p)
        if (socket->createListener (p, "127.0.0.1")) { port = p; break; }
    if (port == 0)
        return { false, 0, juce::String ("No free port from ") + juce::String (first) + " to " + juce::String (first + 9) };

    listener = std::move (socket);
    boundPort = port;
    startThread();

    // announce it for ssb-mcp
    const auto dir = mcp::discoveryDirectory();
    dir.createDirectory();
    discoveryFile = dir.getChildFile (juce::String (mcp::processId()) + "-" + juce::String (port) + ".json");
    auto* o = new juce::DynamicObject();
    o->setProperty ("port", port);
    o->setProperty ("token", token);
    o->setProperty ("name", name);
    o->setProperty ("pid", mcp::processId());
    discoveryFile.replaceWithText (juce::JSON::toString (juce::var (o)));
    mcp::makePrivate (discoveryFile);
    return status();
}

void McpServer::stop()
{
    if (listener)
    {
        signalThreadShouldExit();
        listener->close();   // wakes waitForNextConnection
        stopThread (3000);
        listener.reset();
    }
    connections.removeAllJobs (true, 5000);
    if (discoveryFile != juce::File())
    {
        discoveryFile.deleteFile();
        discoveryFile = juce::File();
    }
    boundPort = 0;
}

McpServer::Status McpServer::status() const
{
    return { listener != nullptr, boundPort, {} };
}

void McpServer::setForward (Forward f)
{
    std::map<int, std::shared_ptr<Pending>> orphans;
    {
        const juce::ScopedLock sl (shared->lock);
        shared->forward = std::move (f);
        if (! shared->forward) orphans.swap (shared->pending);
    }
    // the page went away with requests in hand: they won't be answered
    for (auto& [id, p] : orphans)
    {
        p->status = 503;
        p->body = rpcError (-32000, "SSB's window closed before it answered");
        p->done.signal();
    }
}

void McpServer::reply (int id, int httpStatus, const juce::String& body)
{
    std::shared_ptr<Pending> p;
    {
        const juce::ScopedLock sl (shared->lock);
        if (auto it = shared->pending.find (id); it != shared->pending.end())
        {
            p = it->second;
            shared->pending.erase (it);
        }
    }
    if (! p) return;   // timed out already
    p->status = httpStatus;
    p->body = body;
    p->done.signal();
}

void McpServer::run()
{
    while (! threadShouldExit())
    {
        std::unique_ptr<juce::StreamingSocket> client (listener ? listener->waitForNextConnection() : nullptr);
        if (threadShouldExit()) break;
        if (! client) continue;
        auto* raw = client.release();
        connections.addJob ([this, raw]
        {
            std::unique_ptr<juce::StreamingSocket> s (raw);
            serve (*s);
            s->close();
        });
    }
}

void McpServer::serve (juce::StreamingSocket& s)
{
    // ---- the request: its head, then Content-Length bytes of body
    juce::MemoryBlock buf;
    char chunk[16384];
    int headEnd = -1;
    while (headEnd < 0)
    {
        if (s.waitUntilReady (true, 10000) != 1) return;
        const int n = s.read (chunk, (int) sizeof (chunk), false);
        if (n <= 0) return;
        buf.append (chunk, (size_t) n);
        const auto text = juce::String::fromUTF8 ((const char*) buf.getData(), (int) buf.getSize());
        headEnd = text.indexOf ("\r\n\r\n");
        if (headEnd < 0 && (int) buf.getSize() > maxHeader) return respond (s, 413, {});
    }
    const auto all = juce::String::fromUTF8 ((const char*) buf.getData(), (int) buf.getSize());
    const auto head = all.substring (0, headEnd);
    juce::StringArray lines;
    lines.addLines (head);
    const auto requestLine = juce::StringArray::fromTokens (lines[0], " ", "");
    const auto method = requestLine[0];
    const auto path = requestLine[1].upToFirstOccurrenceOf ("?", false, false);
    juce::StringPairArray headers;
    for (int i = 1; i < lines.size(); ++i)
        headers.set (lines[i].upToFirstOccurrenceOf (":", false, false).trim().toLowerCase(),
                     lines[i].fromFirstOccurrenceOf (":", false, false).trim());

    if (path != "/mcp") return respond (s, 404, rpcError (-32000, "SSB's MCP endpoint is /mcp"));
    // a web page somewhere else must not reach it (the browser sends its Origin)
    if (const auto origin = headers["origin"]; origin.isNotEmpty() && ! localOrigin (origin))
        return respond (s, 403, rpcError (-32000, "Requests from web pages are refused"));
    // no server-sent stream and no sessions to end: POST only
    if (method != "POST") return respond (s, 405, {}, "Allow: POST\r\n");
    if (token.isNotEmpty() && headers["authorization"] != "Bearer " + token)
        return respond (s, 401, rpcError (-32001, "The bearer token is missing or wrong (SSB ▸ AI ▸ ⚙ ▸ MCP shows it)"),
                        "WWW-Authenticate: Bearer realm=\"ssb\"\r\n");
    if (! headers["content-type"].containsIgnoreCase ("application/json"))
        return respond (s, 415, rpcError (-32000, "Content-Type must be application/json"));

    const int length = headers["content-length"].getIntValue();
    if (length < 0 || length > maxBody) return respond (s, 413, {});
    // bytes after the head that arrived with it
    const auto headBytes = (size_t) juce::String (all.substring (0, headEnd + 4)).getNumBytesAsUTF8();
    juce::MemoryBlock body;
    if (buf.getSize() > headBytes) body.append ((const char*) buf.getData() + headBytes, buf.getSize() - headBytes);
    while ((int) body.getSize() < length)
    {
        if (s.waitUntilReady (true, 10000) != 1) return;
        const int n = s.read (chunk, (int) std::min<size_t> (sizeof (chunk), (size_t) length - body.getSize()), false);
        if (n <= 0) return;
        body.append (chunk, (size_t) n);
    }

    // ---- to the page, and back
    auto pending = std::make_shared<Pending>();
    const int id = nextId++;
    {
        const juce::ScopedLock sl (shared->lock);
        shared->pending[id] = pending;
    }
    juce::MessageManager::callAsync ([w = std::weak_ptr<Shared> (shared), id, text = body.toString()]
    {
        auto sh = w.lock();
        if (! sh) return;
        Forward f;
        {
            const juce::ScopedLock sl (sh->lock);
            f = sh->forward;
        }
        if (f && f (id, text)) return;
        std::shared_ptr<Pending> p;
        {
            const juce::ScopedLock sl (sh->lock);
            if (auto it = sh->pending.find (id); it != sh->pending.end()) { p = it->second; sh->pending.erase (it); }
        }
        if (! p) return;
        p->status = 503;
        p->body = rpcError (-32000, "Open SSB's window: its tools run there (in a DAW, the plugin's editor)");
        p->done.signal();
    });
    if (! pending->done.wait (requestTimeoutMs))
    {
        const juce::ScopedLock sl (shared->lock);
        shared->pending.erase (id);
        return respond (s, 504, rpcError (-32000, "SSB didn't answer in time"));
    }
    respond (s, pending->body.isEmpty() ? 202 : pending->status, pending->body);
}

} // namespace ssb
