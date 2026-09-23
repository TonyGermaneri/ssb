# SSB -- Super Sound Board, native build.
#
# An instrument (AU, VST3, Standalone) whose editor is the web app in ../src. The web app is not
# disturbed by any of this: the plugin serves the page Vite already built (../dist) and never
# keeps a second copy of it. See cmake/WebAssets.cmake.
#
#   npm ci && npm run build                      # the page, once
#   cmake -B native/build -S native -G Ninja -DCMAKE_OSX_ARCHITECTURES=arm64
#   cmake --build native/build
#   ctest --test-dir native/build --output-on-failure

cmake_minimum_required(VERSION 3.22)

# Before project(). 11.0 is the oldest macOS whose WKWebView treats a custom URL scheme as a secure
# context, which the page's IndexedDB storage depends on.
if(APPLE AND NOT DEFINED CMAKE_OSX_DEPLOYMENT_TARGET)
    set(CMAKE_OSX_DEPLOYMENT_TARGET 11.0 CACHE STRING "Minimum macOS version")
endif()

# Universal by default: a host launched under Rosetta never lists an arm64-only plugin, silently.
# Set CMAKE_OSX_ARCHITECTURES=arm64 while iterating.
if(APPLE AND NOT DEFINED CMAKE_OSX_ARCHITECTURES)
    set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "Architectures to build")
endif()

project(SsbNative VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE RelWithDebInfo CACHE STRING "" FORCE)
endif()

option(SSB_BUILD_PLUGIN "Build the AU / VST3 / Standalone targets" ON)
option(SSB_BUILD_TESTS  "Build the unit tests" ON)
option(SSB_SANITIZE     "Build with ASan and UBSan" OFF)
option(SSB_INSTALL_AFTER_BUILD "Copy the built plugins into your own plugin folders" OFF)

# ---------------------------------------------------------------------------- identity
#
# WaveContour makes SSB, as it makes Waveshape and jamin: the company is what a host lists a plugin
# under and the manufacturer code is what it groups by, so both match theirs exactly.
#
# The four-character codes cannot be revised later: a host remembers a plugin by manufacturer +
# plugin code and nothing else, so changing them after a release orphans every saved session.
# Not cache variables, deliberately -- a cached identity goes stale without saying so.
foreach(_stale IN ITEMS SSB_COMPANY SSB_PRODUCT SSB_PLUGIN_NAME SSB_BUNDLE_ID SSB_MANUFACTURER SSB_PLUGIN_CODE)
    unset(${_stale} CACHE)
endforeach()

set(SSB_COMPANY      "WaveContour")        # what a host lists it under
set(SSB_PRODUCT      "SSB")                # bundle / app file names
set(SSB_PLUGIN_NAME  "Super Sound Board")  # what a host shows
set(SSB_BUNDLE_ID    "dev.SSB")
set(SSB_MANUFACTURER "WvCt")               # shared with Waveshape and jamin
set(SSB_PLUGIN_CODE  "Ssb1")

foreach(_code IN ITEMS SSB_MANUFACTURER SSB_PLUGIN_CODE)
    string(LENGTH "${${_code}}" _length)
    if(NOT _length EQUAL 4)
        message(FATAL_ERROR "${_code} must be exactly four characters, not \"${${_code}}\"")
    endif()
endforeach()

# Codes already taken under WvCt (from `auval -a` on the machine that makes them). Two plugins that
# share manufacturer + plugin code are the same plugin to a host, which loads whichever it saw
# first -- worth failing a configure over.
set(_taken_codes  Wvs1      PrPl             Wvr1      Jam1   JamF)
set(_taken_owners Waveshape "Prophet Panel"  Waveroll  jamin  "jamin MIDI FX")
list(LENGTH _taken_codes _count)
math(EXPR _last "${_count} - 1")
foreach(_i RANGE ${_last})
    list(GET _taken_codes  ${_i} _code)
    list(GET _taken_owners ${_i} _owner)
    if(SSB_PLUGIN_CODE STREQUAL _code)
        message(FATAL_ERROR "${_code} is already ${_owner}'s, under this same manufacturer.")
    endif()
endforeach()

# ---------------------------------------------------------------------------- the web app
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")
include(WebAssets)

# ---------------------------------------------------------------------------- JUCE
#
# 8.x: WebBrowserComponent's native integration (withResourceProvider, withNativeFunction,
# emitEvent) arrived in JUCE 8 and is the basis of the editor.
if(SSB_BUILD_PLUGIN)
    set(SSB_JUCE_TAG "8.0.15" CACHE STRING "JUCE release tag")
    include(FetchContent)
    FetchContent_Declare(JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG        "${SSB_JUCE_TAG}"
        GIT_SHALLOW    TRUE
        GIT_PROGRESS   TRUE)
    FetchContent_MakeAvailable(JUCE)
endif()

if(SSB_SANITIZE)
    add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
    add_link_options(-fsanitize=address,undefined)
endif()

# The sound engine: plain C++, no JUCE, testable without a host. @see core/README
add_subdirectory(core)

if(SSB_BUILD_PLUGIN)
    add_subdirectory(plugin)
endif()

if(SSB_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()

message(STATUS "")
message(STATUS "  SSB ${PROJECT_VERSION}")
message(STATUS "  web   ${SSB_WEB_DIST}")
if(SSB_BUILD_PLUGIN)
    message(STATUS "  juce  ${SSB_JUCE_TAG}")
endif()
message(STATUS "")
