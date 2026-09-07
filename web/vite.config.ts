import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import * as cesiumPlugin from 'vite-plugin-cesium'
import { defineConfig } from 'vite'
import type { PluginOption } from 'vite'

// vite-plugin-cesium ships as a dual package; normalise its default export across the interop shapes.
const cesium = ((cesiumPlugin as { default?: unknown }).default ?? cesiumPlugin) as () => PluginOption

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cesium()],
  server: { port: 5173 },
})
