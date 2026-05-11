import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'path'
import basicSsl from '@vitejs/plugin-basic-ssl'

const cesiumSource = 'node_modules/cesium/Build/Cesium'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Workers/**/*`, dest: 'cesium/Workers' },
        { src: `${cesiumSource}/ThirdParty/**/*`, dest: 'cesium/ThirdParty' },
        { src: `${cesiumSource}/Assets/**/*`, dest: 'cesium/Assets' },
        { src: `${cesiumSource}/Widgets/**/*`, dest: 'cesium/Widgets' },
      ],
    }),
  ],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
})

