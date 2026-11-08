import { defineConfig } from 'vitest/config';

// A relative base ('./') keeps every built path relative to index.html, so the same dist/ works
// at the root of its own domain (stationkeeper.longlight.games, the live address) and under any
// sub-path. At runtime import.meta.env.BASE_URL is './'.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
