# ssb-mcp: the stdio bridge to SSB's MCP server (a running app / plugin serves the tools over
# HTTP; this is what an MCP client launches). Only juce_core: no GUI, no audio. Copied into each
# bundle (Contents/Helpers, or beside the binary on Windows) by ssb_bundle_web, and from there to a
# fixed place when the MCP switch is turned on. @see McpCommon.h
juce_add_console_app(ssb-mcp PRODUCT_NAME "ssb-mcp")
target_sources(ssb-mcp PRIVATE ssb_mcp.cpp)
target_include_directories(ssb-mcp PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_definitions(ssb-mcp PRIVATE JUCE_USE_CURL=0 JUCE_WEB_BROWSER=0 JUCE_STANDALONE_APPLICATION=1)
target_link_libraries(ssb-mcp PRIVATE juce::juce_core juce::juce_recommended_config_flags)
