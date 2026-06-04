import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'path'

const cesiumSource = 'node_modules/cesium/Build/Cesium'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Workers/**/*`, dest: 'cesium/Workers' },
        { src: `${cesiumSource}/ThirdParty/**/*`, dest: 'cesium/ThirdParty' },
        { src: `${cesiumSource}/Assets/**/*`, dest: 'cesium/Assets' },
        { src: `${cesiumSource}/Widgets/**/*`, dest: 'cesium/Widgets' },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
})
