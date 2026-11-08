#pragma once

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

#include <atomic>
#include <functional>
#include <map>
#include <memory>

namespace ssb
{

/**
    SSB's MCP server's transport: Streamable HTTP on 127.0.0.1, one endpoint (/mcp), POST only.

    It knows nothing of MCP itself. Each request body (JSON-RPC) is handed to the page on the
    message thread (Forward) and the page answers with reply(): the tools are the page's, the same
    ones its own AI agent uses (src/lib/ai/mcp.ts). Without a page (a plugin whose window is shut)
    requests get a 503 that says to open it.

    Local only, and guarded the way the MCP spec asks: bound to the loopback address, requests from
    web pages refused by their Origin, and a bearer token required.
*/
class McpServer final : private juce::Thread
{
public:
    /** Hand a request body to the page; false if there is none. Called on the message thread. */
    using Forward = std::function<bool (int id, const juce::String& body)>;

    McpServer();
    ~McpServer() override;

    struct Status
    {
        bool running { false };
        int port { 0 };
        juce::String error;
    };

    /** Listen on `preferredPort` (or the next free of the nine after it), requiring `token`.
        `name` says who this is in the discovery file (e.g. "SSB AU in Live"). Message thread. */
    Status start (int preferredPort, const juce::String& token, const juce::String& name);
    void stop();
    Status status() const;

    /** Who answers requests: the editor's page while it is open. Message thread. */
    void setForward (Forward);
    /** The page's answer to request `id`: an HTTP status and a body (empty: 202). Message thread. */
    void reply (int id, int httpStatus, const juce::String& body);

private:
    void run() override;   // accepts connections
    void serve (juce::StreamingSocket&);

    struct Pending
    {
        juce::WaitableEvent done;
        int status { 504 };
        juce::String body;
    };
    struct Shared
    {
        juce::CriticalSection lock;
        Forward forward;
        std::map<int, std::shared_ptr<Pending>> pending;
    };
    std::shared_ptr<Shared> shared = std::make_shared<Shared>();
    std::atomic<int> nextId { 1 };

    std::unique_ptr<juce::StreamingSocket> listener;
    juce::ThreadPool connections { juce::ThreadPoolOptions{}.withThreadName ("ssb mcp request").withNumberOfThreads (4) };
    int boundPort { 0 };
    juce::String token;
    juce::File discoveryFile;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (McpServer)
};

} // namespace ssb
