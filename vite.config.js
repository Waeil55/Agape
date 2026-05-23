import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'esnext',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
          if (id.includes('firebase')) return 'firebase-vendor';
          if (id.includes('lucide-react')) return 'icons-vendor';
          if (id.includes('@capacitor')) return 'native-vendor';
          if (id.includes('xlsx') || id.includes('jspdf')) return 'document-vendor';
          return 'vendor';
        },
      },
    },
  },
});
