import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    allowOnly: false,
    passWithNoTests: false,
    // Het JSON-rapport leest scripts/controleer-overgeslagen.ts: overgeslagen of todo-tests laten de poort falen.
    reporters: ['default', 'json'],
    outputFile: { json: 'testuitkomsten/vitest.json' },
  },
});
