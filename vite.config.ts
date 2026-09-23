/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  // relative, so the same dist/ works at https://<user>.github.io/ssb/ and from any other folder
  base: './',
  plugins: [vue(), vuetify({ autoImport: true })],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
