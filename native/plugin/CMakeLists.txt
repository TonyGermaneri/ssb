# One instrument, three formats. The editor is the page; the processor forwards MIDI to it.

# Read once and handed to the target as text (JUCE parses the string it is given). Flattened to
# one line with the comment removed: JUCE writes these options into a file it reads back a line at
# a time, and a value with a newline in it silently loses everything after the first line.
file(READ "${CMAKE_CURRENT_SOURCE_DIR}/../packaging/Info.extra.plist" SSB_EXTRA_PLIST)
string(REGEX REPLACE "<!--.*-->" "" SSB_EXTRA_PLIST "${SSB_EXTRA_PLIST}")
string(REGEX REPLACE "[\r\n]+" " " SSB_EXTRA_PLIST "${SSB_EXTRA_PLIST}")
string(REGEX REPLACE " +" " " SSB_EXTRA_PLIST "${SSB_EXTRA_PLIST}")

# On Windows JUCE serves a page through a ResourceProvider only with WebView2.
if(WIN32)
    set(SSB_NEEDS_WEBVIEW2 TRUE)
else()
    set(SSB_NEEDS_WEBVIEW2 FALSE)
endif()

juce_add_plugin(SsbInstrument
    COMPANY_NAME              "${SSB_COMPANY}"
    BUNDLE_ID                 "${SSB_BUNDLE_ID}"
    PLUGIN_MANUFACTURER_CODE  "${SSB_MANUFACTURER}"
    PLUGIN_CODE               "${SSB_PLUGIN_CODE}"
    PRODUCT_NAME              "${SSB_PRODUCT}"
    PLUGIN_NAME               "${SSB_PLUGIN_NAME}"
    DESCRIPTION               "Sampler, synth and soundboard"

    IS_SYNTH                  TRUE
    NEEDS_MIDI_INPUT          TRUE
    NEEDS_MIDI_OUTPUT         FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE      # the computer keyboard plays the pads
    VST3_CATEGORIES           Instrument Sampler Synth
    AU_MAIN_TYPE              kAudioUnitType_MusicDevice

    NEEDS_WEBVIEW2            ${SSB_NEEDS_WEBVIEW2}
    FORMATS                   AU VST3 Standalone
    PLIST_TO_MERGE            "${SSB_EXTRA_PLIST}"

    # Always FALSE: the page is copied in (and the bundle re-sealed) by a later target, so JUCE's
    # own copy would install the bundle from before that. @see cmake/WebAssets.cmake
    COPY_PLUGIN_AFTER_BUILD   FALSE)

target_sources(SsbInstrument PRIVATE
    PluginProcessor.cpp
    PluginEditor.cpp
    PluginPaths.cpp
    SoundLibrary.cpp
    StandaloneApp.cpp)

target_compile_definitions(SsbInstrument PUBLIC
    JUCE_WEB_BROWSER=1
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_USE_CUSTOM_PLUGIN_STANDALONE_APP=1)   # StandaloneApp.cpp: a resizable, maximisable window

if(WIN32)
    target_compile_definitions(SsbInstrument PUBLIC JUCE_USE_WIN_WEBVIEW2=1)
endif()

target_link_libraries(SsbInstrument
  PRIVATE
    ssb_core
    ssb_engine
    juce::juce_audio_utils
    juce::juce_dsp
    juce::juce_gui_extra
  PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

# Every format is its own bundle and a standalone cannot read the AU's resources, so each gets its
# own copy of the page.
foreach(_format IN ITEMS AU VST3 Standalone)
    if(TARGET SsbInstrument_${_format})
        set(_where "")
        if(SSB_INSTALL_AFTER_BUILD AND NOT _format STREQUAL "Standalone")
            get_property(_where GLOBAL PROPERTY JUCE_${_format}_COPY_DIR)
        endif()
        ssb_bundle_web(SsbInstrument_${_format} "${_where}")
    endif()
endforeach()
