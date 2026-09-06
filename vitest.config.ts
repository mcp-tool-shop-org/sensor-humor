import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/.swarm/**', '**/node_modules/**', '**/dist/**', '**/site/**'],
  },
});
