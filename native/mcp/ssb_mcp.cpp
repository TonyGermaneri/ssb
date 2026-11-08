// ssb-mcp: SSB's MCP server for clients that start a command (stdio transport): Claude Code,
// Claude Desktop, Cursor and the like. It is a bridge. The tools run in SSB's page, behind the
// HTTP server a running SSB (app or plugin) opens when its MCP switch is on; this reads
// newline-delimited JSON-RPC on stdin, hands each message to that server, and writes the answers to
// stdout. Which SSB: the newest one running (each announces itself, see McpCommon.h), or --port.
//
//   ssb-mcp            serve on stdio
//   ssb-mcp --list     the SSBs running with MCP on
//   ssb-mcp --port N   use the one on port N
//
// stdout carries JSON-RPC only; anything for a person goes to stderr.

#include "McpCommon.h"

#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <iostream>
#include <string>

#if JUCE_MAC || JUCE_LINUX
 #include <csignal>
#endif

namespace
{
struct Target
{
    int port { 0 };
    juce::String token, name;
};

bool alive (int pid)
{
   #if JUCE_MAC || JUCE_LINUX
    return pid > 0 && (::kill (pid, 0) == 0 || errno == EPERM);
   #else
    return pid > 0;   // the connection attempt is the real test
   #endif
}

/** the running servers, newest first */
juce::Array<Target> discover()
{
    juce::Array<juce::File> files = ssb::mcp::discoveryDirectory().findChildFiles (juce::File::findFiles, false, "*.json");
    std::sort (files.begin(), files.end(), [] (const juce::File& a, const juce::File& b)
               { return a.getLastModificationTime() > b.getLastModificationTime(); });
    juce::Array<Target> out;
    for (const auto& f : files)
    {
        const auto v = juce::JSON::parse (f);
        const int pid = v.getProperty ("pid", 0);
        if (! alive (pid))
        {
            f.deleteFile();   // a crashed SSB's leftover
            continue;
        }
        out.add ({ (int) v.getProperty ("port", 0), v.getProperty ("token", "").toString(), v.getProperty ("name", "SSB").toString() });
    }
    return out;
}

struct Reply
{
    bool connected { false };
    int status { 0 };
    std::string body;
};

/** one POST to the server (HTTP/1.1, Connection: close) */
Reply post (const Target& t, const std::string& json)
{
    Reply r;
    juce::StreamingSocket s;
    if (! s.connect ("127.0.0.1", t.port, 3000)) return r;
    r.connected = true;
    std::string req = "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:" + std::to_string (t.port)
                    + "\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\n";
    if (t.token.isNotEmpty()) req += "Authorization: Bearer " + t.token.toStdString() + "\r\n";
    req += "Content-Length: " + std::to_string (json.size()) + "\r\nConnection: close\r\n\r\n" + json;
    for (size_t sent = 0; sent < req.size();)
    {
        const int n = s.write (req.data() + sent, (int) std::min<size_t> (65536, req.size() - sent));
        if (n <= 0) return r;
        sent += (size_t) n;
    }
    std::string in;
    char buf[65536];
    // a render, or the user deciding on an approval, can take a while
    for (;;)
    {
        const int ready = s.waitUntilReady (true, 310000);
        if (ready != 1) break;
        const int n = s.read (buf, (int) sizeof (buf), false);
        if (n <= 0) break;
        in.append (buf, (size_t) n);
    }
    const auto headEnd = in.find ("\r\n\r\n");
    if (headEnd == std::string::npos) return r;
    // "HTTP/1.1 200 OK"
    const auto sp = in.find (' ');
    r.status = sp != std::string::npos ? std::atoi (in.c_str() + sp + 1) : 0;
    r.body = in.substr (headEnd + 4);
    return r;
}

void writeLine (const juce::String& json)
{
    std::cout << json.toStdString() << "\n";
    std::cout.flush();
}

juce::String errorFor (const juce::var& id, int code, const juce::String& message)
{
    auto* err = new juce::DynamicObject();
    err->setProperty ("code", code);
    err->setProperty ("message", message);
    auto* o = new juce::DynamicObject();
    o->setProperty ("jsonrpc", "2.0");
    o->setProperty ("id", id);
    o->setProperty ("error", juce::var (err));
    return juce::JSON::toString (juce::var (o), true);
}
} // namespace

int main (int argc, char** argv)
{
    juce::StringArray args;
    for (int i = 1; i < argc; ++i) args.add (argv[i]);
    if (args.contains ("--help") || args.contains ("-h"))
    {
        std::cerr << "ssb-mcp: SSB's MCP server (stdio), bridging to a running SSB with MCP on.\n"
                     "  --list     the SSBs running with MCP on\n  --port N   use the one on port N\n";
        return 0;
    }
    if (args.contains ("--list"))
    {
        const auto all = discover();
        if (all.isEmpty()) std::cerr << "No SSB is running with MCP on (SSB ▸ AI ▸ ⚙ ▸ MCP SERVER).\n";
        for (const auto& t : all) std::cout << t.port << "  " << t.name << "\n";
        return 0;
    }
    const int wantPort = args.indexOf ("--port") >= 0 ? args[args.indexOf ("--port") + 1].getIntValue() : 0;
    auto pick = [wantPort]() -> Target
    {
        for (const auto& t : discover())
            if (wantPort == 0 || t.port == wantPort) return t;
        return {};
    };

   #if JUCE_MAC || JUCE_LINUX
    std::signal (SIGPIPE, SIG_IGN);
   #endif

    Target target = pick();
    std::string line;
    while (std::getline (std::cin, line))
    {
        if (! line.empty() && line.back() == '\r') line.pop_back();
        if (juce::String (line).trim().isEmpty()) continue;
        const auto msg = juce::JSON::parse (juce::String::fromUTF8 (line.c_str()));
        const bool isRequest = msg.isObject() && msg.hasProperty ("method") && msg.hasProperty ("id");
        const auto id = msg.getProperty ("id", juce::var());

        if (target.port == 0) target = pick();
        Reply r = target.port ? post (target, line) : Reply {};
        if (! r.connected)
        {
            // that SSB went away: another, or the same one restarted on a new port
            target = pick();
            r = target.port ? post (target, line) : Reply {};
        }
        if (! isRequest) continue;   // notifications and responses get no answer
        if (! r.connected)
        {
            writeLine (errorFor (id, -32000, "SSB isn't running with its MCP server on: open SSB, then AI ▸ ⚙ ▸ MCP SERVER ▸ ON"));
            continue;
        }
        const auto body = juce::JSON::parse (juce::String::fromUTF8 (r.body.c_str()));
        if (r.status == 200 && body.isObject())
            writeLine (juce::JSON::toString (body, true));   // one line, as stdio framing needs
        else if (body.isObject() && body.hasProperty ("error"))
        {
            // the server's own error, with this request's id
            body.getDynamicObject()->setProperty ("id", id);
            writeLine (juce::JSON::toString (body, true));
        }
        else
            writeLine (errorFor (id, -32000, "SSB answered HTTP " + juce::String (r.status)));
    }
    return 0;
}
