import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' + hash routing means the same bundle works at a domain root
// (Vercel) and under a repo subpath (GitHub Pages) with no per-host config.
export default defineConfig({
  base: './',
  // Stamped into the parquet fetch URLs so a redeploy always busts HTTP caches.
  define: {
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
