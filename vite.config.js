import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2500,
    // ship the licences of bundled dependencies (three.js is MIT) with the build
    license: { fileName: 'third-party-licenses.md' },
  },
});
