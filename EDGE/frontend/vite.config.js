import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  // IMPORTANT for Electron: all asset paths must be relative (not absolute /)
  // Without this, file:// protocol in packaged app cannot find assets
  base: './',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    // Don't auto-open browser when Electron is launching (it reads this URL itself)
    open: !process.env.ELECTRON_RUN,
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Sourcemaps in production help with debugging issues on client machines
    sourcemap: false,
    rollupOptions: {
      output: {
        // Deterministic chunk names (helps electron-builder cache)
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          icons:  ['lucide-react'],
        },
      },
    },
  },
})
