# The built page, copied into each bundle rather than reimplemented.
#
# SSB's editor is the web app itself: Vite's dist/ is copied into <bundle>/Contents/Resources/web
# and served to the web view through JUCE's ResourceProvider (a juce:// origin, which is a secure
# context, so IndexedDB and localStorage work).

set(SSB_WEB_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." CACHE PATH "The web app's repository root")
set(SSB_WEB_DIST "${SSB_WEB_ROOT}/dist" CACHE PATH "Vite's build output")

# @mdi/font ships eot, ttf, woff and woff2 and the stylesheet names all four; woff2 comes first in
# the src list, so a modern web view never requests the other three.
set(SSB_WEB_EXCLUDE "\\.(eot|ttf|woff)$" CACHE STRING "Files not worth shipping")

find_program(SSB_NPM npm HINTS "$ENV{HOME}/.local/bin" /opt/homebrew/bin /usr/local/bin)

# Adding files to a bundle breaks its code signature, and hardened hosts refuse a broken seal
# ("a sealed resource is missing or invalid"). So the bundle is re-sealed after the page goes in:
# ad-hoc by default, or a Developer ID. CI signs again for real afterwards (tools/macos-sign.sh).
set(SSB_CODESIGN_IDENTITY "-" CACHE STRING "codesign identity, or - for ad-hoc")

# `cmake --build build --target web` rebuilds the page. Not automatic: the plugin build should not
# silently depend on a Node toolchain.
if(SSB_NPM)
    add_custom_target(web
        COMMAND "${SSB_NPM}" run build
        WORKING_DIRECTORY "${SSB_WEB_ROOT}"
        COMMENT "Building the web app with Vite"
        USES_TERMINAL VERBATIM)
endif()

# Copy dist into the target's bundle on every build (only what changed), re-seal it, and
# optionally install it. SSB_WEB_DIR overrides the page at runtime: `npm run build` and reopening
# the editor is then the whole iteration loop. @see plugin/PluginPaths.cpp
function(ssb_bundle_web target)
    set(_dest "${ARGV1}")   # optional: where to install the sealed bundle

    if(NOT EXISTS "${SSB_WEB_DIST}/index.html")
        message(FATAL_ERROR
            "No web build at ${SSB_WEB_DIST}.\n"
            "  Run `npm ci && npm run build` in ${SSB_WEB_ROOT} first,\n"
            "  or `cmake --build <dir> --target web`.")
    endif()

    # A Windows standalone is a bare .exe, and TARGET_BUNDLE_CONTENT_DIR is a generate-time error
    # for anything that is not an Apple bundle -- so the page goes beside the binary there.
    if(APPLE)
        set(_web_dest "$<TARGET_BUNDLE_CONTENT_DIR:${target}>/Resources/web")
    else()
        set(_web_dest "$<TARGET_FILE_DIR:${target}>/Resources/web")
    endif()

    # Its own target rather than POST_BUILD on the plugin: POST_BUILD only fires when the plugin
    # relinks, which would leave a stale page in the bundle after a page-only change.
    add_custom_target(${target}_web ALL
        COMMAND "${CMAKE_COMMAND}"
                -DSRC=${SSB_WEB_DIST}
                -DDEST=${_web_dest}
                -DEXCLUDE=${SSB_WEB_EXCLUDE}
                -P "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/CopyWeb.cmake"
        COMMENT "Copying the web build into ${target}"
        VERBATIM)

    # the MCP bridge (native/mcp) rides along in every bundle, before the seal is remade
    if(TARGET ssb-mcp)
        if(APPLE)
            set(_helpers "$<TARGET_BUNDLE_CONTENT_DIR:${target}>/Helpers")
            # signed on its own first: the linker ad-hoc signs only a universal binary's arm64 slice, and a
            # bundle can't be sealed around nested code that isn't signed ("not signed at all: In subcomponent")
            set(_sign_helper COMMAND codesign --force --sign "${SSB_CODESIGN_IDENTITY}" --timestamp=none
                             "${_helpers}/$<TARGET_FILE_NAME:ssb-mcp>")
        else()
            set(_helpers "$<TARGET_FILE_DIR:${target}>")
            set(_sign_helper "")
        endif()
        add_custom_command(TARGET ${target}_web POST_BUILD
            COMMAND "${CMAKE_COMMAND}" -E make_directory "${_helpers}"
            COMMAND "${CMAKE_COMMAND}" -E copy_if_different "$<TARGET_FILE:ssb-mcp>" "${_helpers}/"
            ${_sign_helper}
            COMMENT "Copying ssb-mcp into ${target}"
            VERBATIM)
        add_dependencies(${target}_web ssb-mcp)
    endif()

    # the sound models' helper (audio.cpp's server, cmake/SoundHelper.cmake) rides along the same way
    if(TARGET ssb-sound-helper)
        get_filename_component(_sound_name "${SSB_SOUND_HELPER}" NAME)
        if(APPLE)
            set(_sound_dir "$<TARGET_BUNDLE_CONTENT_DIR:${target}>/Helpers")
            set(_sign_sound COMMAND codesign --force --sign "${SSB_CODESIGN_IDENTITY}" --timestamp=none
                            "${_sound_dir}/${_sound_name}")
        else()
            set(_sound_dir "$<TARGET_FILE_DIR:${target}>")
            set(_sign_sound "")
        endif()
        add_custom_command(TARGET ${target}_web POST_BUILD
            COMMAND "${CMAKE_COMMAND}" -E make_directory "${_sound_dir}"
            COMMAND "${CMAKE_COMMAND}" -E copy_if_different "${SSB_SOUND_HELPER}" "${_sound_dir}/"
            ${_sign_sound}
            COMMENT "Copying the sound models' helper into ${target}"
            VERBATIM)
        add_dependencies(${target}_web ssb-sound-helper)
    endif()

    if(APPLE)
        add_custom_command(TARGET ${target}_web POST_BUILD
            COMMAND codesign --force --sign "${SSB_CODESIGN_IDENTITY}"
                    --timestamp=none $<TARGET_BUNDLE_DIR:${target}>
            COMMAND codesign --verify --strict $<TARGET_BUNDLE_DIR:${target}>
            COMMENT "Re-sealing ${target} around the page"
            VERBATIM)
    endif()

    # Installed from here, after the page is in and the seal remade -- not from JUCE's
    # COPY_PLUGIN_AFTER_BUILD, which runs before this target and would install the old page.
    if(APPLE AND SSB_INSTALL_AFTER_BUILD AND _dest)
        add_custom_command(TARGET ${target}_web POST_BUILD
            COMMAND "${CMAKE_COMMAND}"
                    -DBUNDLE=$<TARGET_BUNDLE_DIR:${target}>
                    -DDEST=${_dest}
                    -P "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/InstallBundle.cmake"
            COMMENT "Installing ${target} into ${_dest}"
            VERBATIM)
    endif()

    add_dependencies(${target}_web ${target})
endfunction()
