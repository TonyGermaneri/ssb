add_executable(ssb-tests
    main.cpp
    MidiQueueTest.cpp)

target_link_libraries(ssb-tests PRIVATE ssb_core)
add_test(NAME core COMMAND ssb-tests)

# The engine, driven without a host: unit tests, and `ssb-render` for rendering a board to WAV.
if(SSB_BUILD_PLUGIN)
    juce_add_console_app(ssb-engine-tests PRODUCT_NAME "ssb-engine-tests")
    target_sources(ssb-engine-tests PRIVATE engine_main.cpp EngineTest.cpp)
    target_compile_definitions(ssb-engine-tests PRIVATE JUCE_USE_CURL=0 JUCE_WEB_BROWSER=0
        SSB_TESTS_DIR="${CMAKE_CURRENT_SOURCE_DIR}")
    target_link_libraries(ssb-engine-tests PRIVATE
        ssb_engine
        juce::juce_dsp
        juce::juce_audio_formats
        juce::juce_recommended_config_flags)
    add_test(NAME engine COMMAND ssb-engine-tests)
endif()

# A live check of the sound models' host: downloads a model and runs audio.cpp's helper, so it isn't a ctest;
# run it by hand (see the file's header).
if(SSB_BUILD_PLUGIN AND TARGET ssb-sound-helper)
    juce_add_console_app(ssb-sound-check PRODUCT_NAME "ssb-sound-check")
    target_sources(ssb-sound-check PRIVATE SoundHostCheck.cpp ../plugin/SoundHost.cpp)
    target_include_directories(ssb-sound-check PRIVATE ../plugin ../mcp)
    target_compile_definitions(ssb-sound-check PRIVATE JUCE_USE_CURL=0 JUCE_WEB_BROWSER=0 JUCE_STANDALONE_APPLICATION=1 JUCE_MODAL_LOOPS_PERMITTED=1)
    target_link_libraries(ssb-sound-check PRIVATE juce::juce_events juce::juce_recommended_config_flags)
    add_dependencies(ssb-sound-check ssb-sound-helper)
endif()
