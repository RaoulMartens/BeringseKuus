// Schrijft de omgeving voor de lokale Supabase (npm run env:lokaal):
//   .env.local         voor `npm run dev` (Next.js op poort 3000)
//   .dev.vars          voor `npm run preview:worker` (de app-Worker in workerd op poort 8787)
// Beide staan in .gitignore en komen nooit in de repository; de waarden worden niet getoond. De geheime sleutel van
// Supabase hoort hier niet in: de app gebruikt hem nooit (Bouwbesluiten 3.1, review PR12-01).

import { writeFileSync } from 'node:fs';

import { leesLokaleSupabase } from './lokale-supabase.ts';

const KOP = '# Gemaakt door npm run env:lokaal. Alleen voor de lokale Supabase; nooit committen.';
const lokaal = leesLokaleSupabase();
const app = (siteUrl: string): string =>
  [
    KOP,
    `SUPABASE_URL=${lokaal.apiUrl}`,
    `SUPABASE_PUBLISHABLE_KEY=${lokaal.publishableKey}`,
    `SITE_URL=${siteUrl}`,
    '',
  ].join('\n');

writeFileSync('.env.local', app('http://127.0.0.1:3000'), { mode: 0o600 });
writeFileSync('.dev.vars', app('http://127.0.0.1:8787'), { mode: 0o600 });
console.log('.env.local en .dev.vars geschreven (waarden niet getoond).');
