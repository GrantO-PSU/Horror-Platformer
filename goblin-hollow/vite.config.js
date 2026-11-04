import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built dist/ works from any path.
  base: './',
  server: {
    host: true,
    open: false,
  },
  build: {
    target: 'es2019',
    outDir: 'dist',
    // Keep static files in public/ as real files (never inlined).
    assetsInlineLimit: 0,
  },
});
