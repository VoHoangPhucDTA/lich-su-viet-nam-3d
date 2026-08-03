import { configDefaults, defineConfig } from 'vitest/config'
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
        { src: path.resolve(__dirname, '../data/exams/*.json').replace(/\\/g, '/'), dest: 'data/exams' },
      ],
    }),
  ],
  server: {
    port: 5173,
    // Proxy /api/* → backend localhost:8080.
    // Mục đích: làm cho frontend và backend "cùng origin" trong mắt browser khi dev.
    // Nhờ đó cookie HttpOnly (SameSite=Lax) hoạt động mà không cần HTTPS hay SameSite=None.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
      ...configDefaults.exclude,
      '**/terrain_3d_audit_bundle/**',
      '**/context_zoom/**',
      '**/context_zoom*/**',
      '**/_analysis/**',
    ],
  },
})

