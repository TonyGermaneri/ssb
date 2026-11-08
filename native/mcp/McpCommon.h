#pragma once

#include <juce_core/juce_core.h>

#if JUCE_MAC || JUCE_LINUX
 #include <sys/stat.h>
 #include <unistd.h>
#elif JUCE_WINDOWS
 #include <process.h>
#endif

/**
    What SSB's MCP server (in the app / plugin, McpServer) and its command-line bridge (ssb-mcp)
    agree on: where a running server announces itself, and where the bridge is installed.

    A running server writes <support>/mcp/<pid>-<port>.json -- { port, token, name, pid } -- and
    removes it when it stops; ssb-mcp reads those to find one. The files hold the server's bearer
    token, so only the user may read them.
*/
namespace ssb::mcp
{

/** ~/Library/Application Support/WaveContour/SSB (macOS), %APPDATA%\WaveContour\SSB (Windows) */
inline juce::File supportDirectory()
{
   #if JUCE_MAC
    const auto base = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory).getChildFile ("Application Support");
   #else
    const auto base = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory);
   #endif
    return base.getChildFile ("WaveContour").getChildFile ("SSB");
}

inline juce::File discoveryDirectory() { return supportDirectory().getChildFile ("mcp"); }

/** where the bridge is copied to, so an MCP client's configuration names one path for good */
inline juce::File installedBridge()
{
   #if JUCE_WINDOWS
    return supportDirectory().getChildFile ("bin").getChildFile ("ssb-mcp.exe");
   #else
    return supportDirectory().getChildFile ("bin").getChildFile ("ssb-mcp");
   #endif
}

inline int processId()
{
   #if JUCE_WINDOWS
    return (int) ::_getpid();
   #else
    return (int) ::getpid();
   #endif
}

/** only the user may read it (it holds a token) */
inline void makePrivate (const juce::File& f)
{
   #if JUCE_MAC || JUCE_LINUX
    ::chmod (f.getFullPathName().toRawUTF8(), 0600);
   #else
    juce::ignoreUnused (f);
   #endif
}

} // namespace ssb::mcp
