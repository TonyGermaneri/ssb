import { reactive } from 'vue'

/**
 * VOYAGE's crossfades, by layer id: while the ship sails, a VCO's new sound (a caught rock's) stitches into what's
 * sounding over this many seconds, as a growing garden's clips do -- the page's engine by engine.stitch, the plugin's
 * as the layer arrives with its new audio (engineSync reads this beside the garden's fade).
 */
export const voyageFades = reactive(new Map<string, number>())
