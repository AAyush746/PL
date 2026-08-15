import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All API + media traffic is relayed through the Vite dev server to the
      // backend on this host. Using relative URLs (VITE_API_BASE left empty)
      // means the browser only ever talks to the forwarded dev-server port,
      // which works even when the backend's real port (8000) is not forwarded
      // to the developer's machine (e.g. a remote/cloud dev environment).
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Lesson videos and other media served by the backend (localhost:8000).
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/media': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
