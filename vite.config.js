import { defineConfig } from 'vite';

// Relative paths so the build works under https://<user>.github.io/Rally/ as well as locally.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 4000 },
});
