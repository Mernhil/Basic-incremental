// Builds the beta review page into dist/ as a classic script so index.html opens from disk.
// Usage: npx vite build -c design/beta-review/vite.config.mts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'review.ts'),
      formats: ['iife'],
      name: 'Review',
      fileName: () => 'review.js',
      cssFileName: 'review',
    },
  },
});
