import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run tests in our own src/ directory — exclude the cloned Medplum repo
    include: ['src/**/*.test.ts'],
    exclude: ['src/medplum/**', 'node_modules/**'],
    environment: 'node',
  },
});
