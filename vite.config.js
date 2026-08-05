import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'agape-offline-asset-manifest',
      generateBundle(_options, bundle) {
        const files = Object.values(bundle)
          .map((item) => `/${item.fileName}`)
          .filter((fileName) => fileName !== '/asset-manifest.json');
        this.emitFile({
          type: 'asset',
          fileName: 'asset-manifest.json',
          source: JSON.stringify({ version: 1, files: [...new Set(files)].sort() }),
        });
      },
    },
  ],
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
          if (id.includes('xlsx') || id.includes('jspdf')) return 'document-vendor';
          return 'vendor';
        },
      },
    },
  },
});
