import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' + hash routing means the same bundle works at a domain root
// (Vercel) and under a repo subpath (GitHub Pages) with no per-host config.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
