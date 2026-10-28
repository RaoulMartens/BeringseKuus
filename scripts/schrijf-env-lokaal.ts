// Schrijft de omgeving voor de lokale Supabase (npm run env:lokaal):
//   .env.local  voor `npm run dev` (Next.js op poort 3000)
//   .dev.vars   voor `npm run preview:worker` (de Worker in workerd op poort 8787; een Worker leest geen .env.local)
// Beide staan in .gitignore en komen nooit in de repository; de waarden worden niet getoond.
// Lokaal werkt de agenda-feed met het publieke testtoken: /proef/agenda/<TEST_AGENDA_TOKEN>.ics.
// Alleen .dev.vars krijgt de geheime sleutel, voor de geplande taak in de Worker (proefroute 3). Niet in .env.local:
// Next.js heeft hem niet nodig, en een lokale build zou hem in de bundel opnemen (docs/hosting.md, Lokaal).

import { writeFileSync } from 'node:fs';

import { TEST_AGENDA_TOKEN } from './agenda-testtoken.ts';
import { leesLokaleSupabase } from './lokale-supabase.ts';

const lokaal = leesLokaleSupabase();
const inhoud = (siteUrl: string): string =>
  [
    '# Gemaakt door npm run env:lokaal. Alleen voor de lokale Supabase; nooit committen.',
    `SUPABASE_URL=${lokaal.apiUrl}`,
    `SUPABASE_PUBLISHABLE_KEY=${lokaal.publishableKey}`,
    `SITE_URL=${siteUrl}`,
    `PROEF_AGENDA_TOKEN=${TEST_AGENDA_TOKEN}`,
    '',
  ].join('\n');
writeFileSync('.env.local', inhoud('http://127.0.0.1:3000'), { mode: 0o600 });
writeFileSync('.dev.vars', `${inhoud('http://127.0.0.1:8787')}SUPABASE_SECRET_KEY=${lokaal.secretKey}\n`, {
  mode: 0o600,
});
console.log('.env.local en .dev.vars geschreven (waarden niet getoond).');
