import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      // The other 3 platforms each run their own real app on their own port (see the project root README) -
      // this dev-server proxy is what lets one unified frontend read all 4 without a CORS trip in the browser.
      '/api/meesho': { target: 'http://127.0.0.1:8000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/meesho/, '/api') },
      '/api/snapdeal': { target: 'http://127.0.0.1:8300', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/snapdeal/, '/api') },
      '/api/flipkart': { target: 'http://127.0.0.1:8600', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/flipkart/, '/api') },
    },
  },
})
