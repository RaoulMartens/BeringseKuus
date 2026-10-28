import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Hetzelfde als "paths" in tsconfig.json, zodat tests code met @/… kunnen laden (src/middleware.test.ts).
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
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
