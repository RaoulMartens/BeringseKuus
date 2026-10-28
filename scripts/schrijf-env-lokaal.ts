// Schrijft de omgeving voor de lokale Supabase (npm run env:lokaal):
//   .env.local         voor `npm run dev` (Next.js op poort 3000)
//   .dev.vars          voor `npm run preview:worker` (de app-Worker in workerd op poort 8787)
//   taken/.dev.vars    voor `npx wrangler dev -c taken/wrangler.jsonc` (de taken-Worker)
// Alle drie staan in .gitignore en komen nooit in de repository; de waarden worden niet getoond.
// Lokaal werkt de agenda-feed met het publieke testtoken: /proef/agenda/<TEST_AGENDA_TOKEN>.ics.
// Alleen de taken-Worker krijgt de geheime sleutel, net als online (Bouwbesluiten 3.1, review PR12-01).

import { writeFileSync } from 'node:fs';

import { TEST_AGENDA_TOKEN } from './agenda-testtoken.ts';
import { leesLokaleSupabase } from './lokale-supabase.ts';

const KOP = '# Gemaakt door npm run env:lokaal. Alleen voor de lokale Supabase; nooit committen.';
const lokaal = leesLokaleSupabase();
const app = (siteUrl: string): string =>
  [
    KOP,
    `SUPABASE_URL=${lokaal.apiUrl}`,
    `SUPABASE_PUBLISHABLE_KEY=${lokaal.publishableKey}`,
    `SITE_URL=${siteUrl}`,
    `PROEF_AGENDA_TOKEN=${TEST_AGENDA_TOKEN}`,
    '',
  ].join('\n');
const taken = [KOP, `SUPABASE_URL=${lokaal.apiUrl}`, `SUPABASE_SECRET_KEY=${lokaal.secretKey}`, ''].join(
  '\n',
);

writeFileSync('.env.local', app('http://127.0.0.1:3000'), { mode: 0o600 });
writeFileSync('.dev.vars', app('http://127.0.0.1:8787'), { mode: 0o600 });
writeFileSync('taken/.dev.vars', taken, { mode: 0o600 });
console.log('.env.local, .dev.vars en taken/.dev.vars geschreven (waarden niet getoond).');
