import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const KNOWN_PLATFORMS = ['amazon', 'flipkart', 'meesho', 'snapdeal', 'myntra', 'jiomart'];

const PLATFORM_DISPLAY = {
  amazon: 'Amazon', flipkart: 'Flipkart', meesho: 'Meesho',
  snapdeal: 'Snapdeal', myntra: 'Myntra', jiomart: 'JioMart',
};

function getPlatformKey(filename) {
  const lower = filename.toLowerCase();
  for (const p of KNOWN_PLATFORMS) {
    if (lower.includes(p)) return p;
  }
  return path.basename(filename, '.html').split(/[_\-\s]+/)[0].toLowerCase();
}

function capitalize(s) {
  return PLATFORM_DISPLAY[s] || (s.charAt(0).toUpperCase() + s.slice(1));
}

function dashboardSyncPlugin() {
  const srcDir      = path.resolve(__dirname, '../tools/dashboards');
  const destDir     = path.resolve(__dirname, 'public/dashboards');
  const manifestPath = path.join(destDir, 'manifest.json');

  function syncAll() {
    if (!fs.existsSync(srcDir)) return;
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const files = fs.readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.html'));
    const manifest = {};

    for (const file of files) {
      const key = getPlatformKey(file);
      const destFile = `${key}.html`;
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, destFile));
      manifest[capitalize(key)] = `/dashboards/${destFile}`;
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  return {
    name: 'dashboard-sync',
    buildStart() { syncAll(); },
    configureServer(server) {
      syncAll();
      if (fs.existsSync(srcDir)) {
        fs.watch(srcDir, { persistent: false }, (_event, filename) => {
          if (filename && filename.toLowerCase().endsWith('.html')) {
            syncAll();
            server.ws.send({ type: 'full-reload' });
          }
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), dashboardSyncPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
