# ssb-host: loads the built plugin like a DAW, opens the editor, plays MIDI into it and records the
# output -- the whole page -> engine -> audio path, without a DAW. @see ssb_host.cpp
juce_add_gui_app(ssb-host PRODUCT_NAME "ssb-host")
target_sources(ssb-host PRIVATE ssb_host.cpp)
target_compile_definitions(ssb-host PRIVATE
    JUCE_USE_CURL=0 JUCE_WEB_BROWSER=0
    JUCE_PLUGINHOST_VST3=1 JUCE_PLUGINHOST_AU=1
    JUCE_MODAL_LOOPS_PERMITTED=1)
target_link_libraries(ssb-host PRIVATE
    juce::juce_audio_processors
    juce::juce_audio_formats
    juce::juce_gui_extra
    juce::juce_recommended_config_flags)
if(APPLE)
    # hosting AUs pulls in AUGenericView
    target_link_libraries(ssb-host PRIVATE "-framework CoreAudioKit")
endif()
