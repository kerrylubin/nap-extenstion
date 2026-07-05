import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import path from 'path';
import fs from 'fs';

// Fix the dist manifest for Firefox compatibility.
// CRXJS always outputs "service_worker" which Firefox rejects.
// This plugin watches dist/manifest.json and rewrites it to use "scripts".
function firefoxManifestFix() {
  const distManifest = path.resolve(__dirname, 'dist', 'manifest.json');

  function fixManifest() {
    if (!fs.existsSync(distManifest)) return;
    try {
      const raw = fs.readFileSync(distManifest, 'utf-8');
      const m = JSON.parse(raw);
      if (m.background?.service_worker) {
        const sw = m.background.service_worker;
        delete m.background.service_worker;
        m.background.scripts = [sw];
        fs.writeFileSync(distManifest, JSON.stringify(m, null, 2));
        console.log('[Firefox Fix] Patched dist/manifest.json: service_worker -> scripts');
      }
    } catch {}
  }

  return {
    name: 'firefox-manifest-fix',
    // Fix on build
    writeBundle: fixManifest,
    // Fix during dev: watch the dist folder
    configureServer() {
      // Initial fix after a short delay (wait for CRXJS to generate dist)
      setTimeout(fixManifest, 2000);
      // Watch for future regenerations
      const distDir = path.resolve(__dirname, 'dist');
      try {
        fs.watch(distDir, (_, filename) => {
          if (filename === 'manifest.json') {
            setTimeout(fixManifest, 200);
          }
        });
      } catch {}
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    firefoxManifestFix(),
  ],
  server: {
    host: '127.0.0.1',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
