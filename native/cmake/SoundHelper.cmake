# The AI agent's sound models run in audio.cpp's server, built here from source and carried in every
# bundle as Contents/Helpers/audiocpp_server (beside the binary on Windows). SoundHost
# (plugin/SoundHost.cpp) starts it with one model at a time, out of the DAW's process.
#
# audio.cpp (Apache-2.0, https://github.com/0xShug0/audio.cpp) is pinned to a commit: MOSS-SoundEffect v2
# arrived after its last release (v0.9.4), and a pinned source build is what makes a universal macOS helper.
# Only the two model families SSB uses are compiled in (moss_soundeffect, stable_audio), with the Metal
# backend on macOS and the CPU backend elsewhere. -DSSB_SOUND_MODELS=OFF leaves it out (the AI settings
# then say the build has no sound models).

option(SSB_SOUND_MODELS "Build audio.cpp's server for the AI agent's sound models and carry it in the bundles" ON)

set(SSB_AUDIOCPP_COMMIT "eb8281c9a16d39fe9ac9d07fd3e50d8be606dfaa" CACHE STRING "audio.cpp commit to build")
set(SSB_AUDIOCPP_SHA256 "4e004e18643275d4fc7882758d4451a1a22ea815c7697199f26b865bef7a5808" CACHE STRING "its source tarball's SHA-256")

if(NOT SSB_SOUND_MODELS)
    return()
endif()

include(ExternalProject)

# fixes carried on the pinned source until audio.cpp has them:
# - audiocpp-stable-audio-foundation-inputs.patch: Stable Audio Open 1.0 (audio.cpp's "Foundation" path) wrote its DiT's
#   RoPE positions and its T5's relative-position buckets into their graphs once, when built; the graph allocator
#   reuses an input's memory once the graph has consumed it, so every run after the first (every diffusion step but
#   the first, every request's prompt but the first) read garbage there and the clips came out as noise
find_package(Patch REQUIRED)
set(_patches "${CMAKE_CURRENT_LIST_DIR}/patches/audiocpp-stable-audio-foundation-inputs.patch")
set(_patch_command "")
foreach(_p IN LISTS _patches)
    list(APPEND _patch_command COMMAND "${Patch_EXECUTABLE}" -p1 -i "${_p}")
endforeach()
list(REMOVE_AT _patch_command 0)   # ExternalProject takes the first command bare

if(APPLE)
    set(_backend -DENGINE_ENABLE_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON)
    set(_archs ${CMAKE_OSX_ARCHITECTURES})
    if(NOT _archs)
        set(_archs ${CMAKE_HOST_SYSTEM_PROCESSOR})
    endif()
    # audio.cpp needs macOS 13.3 (std::to_chars for floats); on older systems the helper won't start and
    # the AI settings say so, while the rest of SSB keeps its own minimum
    set(_deploy ${CMAKE_OSX_DEPLOYMENT_TARGET})
    if(NOT _deploy OR _deploy VERSION_LESS 13.3)
        set(_deploy 13.3)
    endif()
else()
    set(_backend -DENGINE_ENABLE_METAL=OFF)
    set(_archs native)
    set(_deploy "")
endif()

set(_exe "audiocpp_server${CMAKE_EXECUTABLE_SUFFIX}")
# audio.cpp sets CMAKE_RUNTIME_OUTPUT_DIRECTORY to bin/, which a multi-config generator (Visual Studio,
# the Windows default; Xcode) turns into bin/<config>/; the build below is always Release
get_property(_multi_config GLOBAL PROPERTY GENERATOR_IS_MULTI_CONFIG)
set(_bin "bin")
if(_multi_config)
    set(_bin "bin/Release")
endif()
set(_slices "")
set(_deps "")
foreach(_arch IN LISTS _archs)
    set(_osx "")
    if(APPLE)
        set(_osx -DCMAKE_OSX_ARCHITECTURES=${_arch} -DCMAKE_OSX_DEPLOYMENT_TARGET=${_deploy})
    endif()
    ExternalProject_Add(audiocpp_${_arch}
        URL "https://github.com/0xShug0/audio.cpp/archive/${SSB_AUDIOCPP_COMMIT}.tar.gz"
        URL_HASH "SHA256=${SSB_AUDIOCPP_SHA256}"
        DOWNLOAD_NAME "audio.cpp-${SSB_AUDIOCPP_COMMIT}.tar.gz"
        DOWNLOAD_DIR "${CMAKE_BINARY_DIR}/_downloads"
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE
        PATCH_COMMAND ${_patch_command}
        PREFIX "${CMAKE_BINARY_DIR}/audiocpp/${_arch}"
        CMAKE_ARGS
            -DCMAKE_BUILD_TYPE=Release
            ${_osx}
            ${_backend}
            -DENGINE_ENABLE_CUDA=OFF
            -DENGINE_ENABLE_VULKAN=OFF
            -DENGINE_ENABLE_OPENMP=OFF
            -DGGML_OPENMP=OFF
            -DENGINE_ENABLE_NATIVE_CPU=OFF   # a binary for every machine of the arch, not this one
            -DGGML_NATIVE=OFF
            -DENGINE_BUILD_TESTS=OFF
            -DENGINE_BUILD_EXAMPLES=OFF
            -DENGINE_BUILD_WARMBENCH=OFF
            -DAUDIOCPP_MODEL_SET=custom
            -DAUDIOCPP_MODELS=moss_soundeffect,stable_audio
            -DAUDIOCPP_DEPLOYMENT_BUILD=ON   # model specs compiled in: a safetensors checkpoint (Stable Audio Open 1.0) needs one
        BUILD_COMMAND "${CMAKE_COMMAND}" --build <BINARY_DIR> --target audiocpp_server --config Release
        INSTALL_COMMAND ""
        BUILD_BYPRODUCTS "<BINARY_DIR>/${_bin}/${_exe}"
        USES_TERMINAL_BUILD TRUE)
    ExternalProject_Get_Property(audiocpp_${_arch} BINARY_DIR)
    list(APPEND _slices "${BINARY_DIR}/${_bin}/${_exe}")
    list(APPEND _deps audiocpp_${_arch})
endforeach()

# one file for the bundles: the slices made universal on macOS
set(SSB_SOUND_HELPER "${CMAKE_BINARY_DIR}/sound-helper/${_exe}" CACHE INTERNAL "")
list(LENGTH _slices _count)
if(APPLE AND _count GREATER 1)
    set(_make lipo -create ${_slices} -output "${SSB_SOUND_HELPER}")
else()
    set(_make "${CMAKE_COMMAND}" -E copy ${_slices} "${SSB_SOUND_HELPER}")
endif()
add_custom_command(OUTPUT "${SSB_SOUND_HELPER}"
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${CMAKE_BINARY_DIR}/sound-helper"
    COMMAND ${_make}
    DEPENDS ${_deps} ${_slices}
    COMMENT "audio.cpp's server for the sound models (${_archs})"
    VERBATIM)
add_custom_target(ssb-sound-helper DEPENDS "${SSB_SOUND_HELPER}")
