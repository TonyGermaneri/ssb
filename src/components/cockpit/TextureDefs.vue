<script setup lang="ts">
import { computed } from 'vue'
import { texture, TEXTURE_SIZE, type TextureId } from '../../lib/voyage/cockpit/textures'

/**
 * The procedural materials (lib/voyage/cockpit/textures.ts) as SVG patterns, `url(#tx-<id>)` -- grey tiles to lay
 * over a colour with mix-blend-mode (overlay, multiply, soft-light, screen). Drop it in an <svg>'s <defs>; the
 * cockpit and the ships outside both do (they're never shown at once, so the ids never clash).
 *
 * Mind: a group with a clip-path (or opacity, a filter, a mask) is an isolated layer, so a blended texture inside it
 * blends only with what's inside the group too -- paint the base colour inside the clipped group, then the texture.
 */
const TEXTURES: TextureId[] = ['brushed', 'leather', 'wood', 'patina', 'carbon', 'speckle', 'scratches', 'grille', 'noise', 'paper', 'velvet', 'knurl']
const tex = computed(() => TEXTURES.map((id) => ({ id, href: texture(id), size: TEXTURE_SIZE[id] })))
</script>

<template>
  <pattern v-for="x in tex" :id="`tx-${x.id}`" :key="x.id" patternUnits="userSpaceOnUse" :width="x.size" :height="x.size">
    <image :href="x.href" :width="x.size" :height="x.size" />
  </pattern>
</template>
