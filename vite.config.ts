import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /StationKeeper/, so every asset URL needs that prefix.
export default defineConfig({
  base: '/StationKeeper/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
