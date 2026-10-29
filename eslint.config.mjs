// ESLint voor de hele repository (bouwgids 14.2). Nul fouten en nul waarschuwingen; een regel uitzetten met
// commentaar in de code kan niet (noInlineConfig). Moet een regel echt anders, pas hem dan hier aan, met reden,
// als aparte wijziging van hoofdstuk 14. scripts/controleer-poort.ts controleert dat het minimum blijft staan.
//
// Dit is het enige JavaScript-bestand: ESLint leest zijn configuratie zonder extra pakket alleen als JavaScript.
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    '.open-next/**',
    '**/.wrangler/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'testuitkomsten/**',
    'next-env.d.ts',
  ]),
  {
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': true, 'ts-nocheck': true, 'ts-check': false },
      ],
    },
  },
  {
    // Typebewuste regels: ook een any die je niet zelf schrijft (bijvoorbeeld uit JSON.parse) mag niet
    // ongemerkt verder. Onbekende invoer is eerst unknown en wordt daarna gecontroleerd.
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
    },
  },
  {
    // Elke Supabase-client in de app komt uit src/lib/supabase/, getypeerd met de databasetypen (bouwgids 14.2,
    // review PR14-08). Zo kan geen client ongetypeerd ontstaan en hoeft niemand een antwoord met de hand om te zetten.
    // Tests en scripts maken hun eigen beheerclient (met de lokale geheime sleutel) en vallen erbuiten.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/lib/supabase/**', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/ssr',
              importNames: ['createServerClient', 'createBrowserClient'],
              message: 'Maak een Supabase-client alleen in src/lib/supabase/ (getypeerd met Database).',
            },
            {
              name: '@supabase/supabase-js',
              importNames: ['createClient'],
              message: 'Maak een Supabase-client alleen in src/lib/supabase/ (getypeerd met Database).',
            },
          ],
        },
      ],
    },
  },
]);
