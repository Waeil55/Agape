import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

// Vite plugin: after build, write a precache manifest for the service worker
function swPrecacheManifest() {
  return {
    name: 'sw-precache-manifest',
    closeBundle() {
      try {
        const distDir = resolve(__dirname, 'dist');
        const assetsDir = join(distDir, 'assets');
        const files = readdirSync(assetsDir);
        const manifest = files.map(f => `/assets/${f}`);
        manifest.push('/');
        manifest.push('/index.html');
        manifest.push('/agape.png');
        manifest.push('/manifest.webmanifest');
        writeFileSync(join(distDir, 'precache-manifest.json'), JSON.stringify(manifest));
        console.log(`[SW] Precache manifest written: ${manifest.length} URLs`);
      } catch (err) {
        console.warn('[SW] Failed to write precache manifest:', err.message);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), swPrecacheManifest()],
  server: {
    port: 3000,
    open: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 3000,
    },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**'],
    },
    middlewareMode: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
          if (id.includes('@firebase/firestore') || id.includes('firebase/firestore')) return 'firebase-firestore';
          if (id.includes('@firebase/auth') || id.includes('firebase/auth')) return 'firebase-auth';
          if (id.includes('@firebase/messaging') || id.includes('firebase/messaging')) return 'firebase-messaging';
          if (id.includes('@firebase/analytics') || id.includes('firebase/analytics')) return 'firebase-analytics';
          if (id.includes('@firebase/functions') || id.includes('firebase/functions')) return 'firebase-functions';
          if (id.includes('@firebase') || id.includes('firebase')) return 'firebase-core';
          if (id.includes('lucide-react')) return 'icons-vendor';
          if (id.includes('@capacitor')) return 'native-vendor';
          if (id.includes('xlsx')) return 'document-vendor';
          return 'vendor';
        },
      },
    },
  },
});
