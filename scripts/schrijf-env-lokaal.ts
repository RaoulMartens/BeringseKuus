// Schrijft .env.local voor `npm run dev` en `npm run start` tegen de lokale Supabase (npm run env:lokaal).
// .env.local staat in .gitignore en komt nooit in de repository; de waarden worden niet getoond.

import { writeFileSync } from 'node:fs';

import { leesLokaleSupabase } from './lokale-supabase.ts';

const lokaal = leesLokaleSupabase();
const inhoud = [
  '# Gemaakt door npm run env:lokaal. Alleen voor de lokale Supabase; nooit committen.',
  `SUPABASE_URL=${lokaal.apiUrl}`,
  `SUPABASE_PUBLISHABLE_KEY=${lokaal.publishableKey}`,
  'SITE_URL=http://127.0.0.1:3000',
  '',
].join('\n');
writeFileSync('.env.local', inhoud, { mode: 0o600 });
console.log('.env.local geschreven (waarden niet getoond).');
