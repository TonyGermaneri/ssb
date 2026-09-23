add_executable(ssb-tests
    main.cpp
    MidiQueueTest.cpp)

target_link_libraries(ssb-tests PRIVATE ssb_core)
add_test(NAME core COMMAND ssb-tests)
