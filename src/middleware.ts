// De middleware draait vóór elke aanvraag die bij de Worker komt (proefroute 2, docs/hosting.md). Drie taken:
//
// Bewust middleware.ts met de edge-runtime, niet proxy.ts (Bouwbesluiten 3.1, 28-10-2026). Next.js 16 noemt
// middleware "deprecated" en geeft bij de build een waarschuwing; proxy.ts draait altijd in de Node-runtime, en
// die ondersteunt OpenNext op Workers alleen als experiment. Beide zijn getest; de browsertests in workerd vangen
// het als een update van Next.js of OpenNext dit breekt.
//
// 1. Een aanvraag over http doorsturen naar https (review F0-05, src/lib/verbinding.ts).
// 2. Een CSP met een nieuwe nonce. Next.js leest de nonce uit de CSP in de aanvraag en geeft hem aan zijn eigen
//    scripts; de browser voert dan alleen die scripts uit. Daarom zijn alle pagina's dynamisch (layout.tsx).
// 3. De sessie verversen. Een verlopen sessie wordt hier vernieuwd, en de nieuwe cookie gaat zowel naar de pagina
//    (in de aanvraag) als naar de browser (in het antwoord). Een Server Component kan dat zelf niet.

import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { contentSecurityPolicy, nieuweNonce } from '@/lib/beveiligingsheaders';
import { cookieOpties } from '@/lib/supabase/cookies';
import { veiligeVerbinding } from '@/lib/verbinding';

const omgeving = process.env.NODE_ENV === 'development' ? 'development' : 'production';

// Langer wacht een pagina niet op Supabase. Zonder grens probeert Supabase bij een storing tot 30 seconden opnieuw,
// en dan hangt elke pagina zo lang, ook /inloggen (review PR10-03).
const MAXIMAAL_WACHTEN_MS = 3000;

/** Laat de aanvraag door naar de pagina, met de CSP in de aanvraag (voor Next.js) en in het antwoord. */
function doorNaarPagina(request: NextRequest, csp: string): NextResponse {
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', csp);
  const antwoord = NextResponse.next({ request: { headers } });
  antwoord.headers.set('Content-Security-Policy', csp);
  return antwoord;
}

/** Wacht op de belofte, maar nooit langer dan de grens; een fout telt als "niet ververst". */
async function hooguit(ms: number, belofte: Promise<unknown>): Promise<void> {
  let klok: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    belofte.catch(() => undefined),
    new Promise((klaar) => {
      klok = setTimeout(klaar, ms);
    }),
  ]);
  clearTimeout(klok);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // 308 en niet 301: de browser herhaalt een formulier (POST) dan ook over https. De agenda-feed niet: die weigert
  // http zelf, zodat een verkeerd ingesteld abonnement meteen faalt (review PR11-01).
  const agenda = request.nextUrl.pathname.startsWith('/proef/agenda/');
  if (!veiligeVerbinding(request.nextUrl) && !agenda) {
    const naar = request.nextUrl.clone();
    naar.protocol = 'https:';
    naar.port = '';
    return NextResponse.redirect(naar, 308);
  }

  const csp = contentSecurityPolicy(omgeving, nieuweNonce());
  let antwoord = doorNaarPagina(request, csp);

  // Een serveractie (bijvoorbeeld uitloggen) regelt zijn eigen cookies. Ververst de middleware eerst, dan komt
  // die nieuwe sessie ná het wissen in het antwoord en blijft hij staan (review PR10-01).
  if (request.headers.has('next-action')) return antwoord;
  // De agenda-feed kent geen sessie: een agenda-app logt niet in, en een .ics hoort geen cookie te krijgen
  // (review PR11-09).
  if (agenda) return antwoord;
  // Zonder sessiecookie valt er niets te verversen; dan ook geen aanroep naar Supabase.
  if (!request.cookies.getAll().some(({ name }) => name.startsWith('sb-'))) return antwoord;
  // Ontbreken de gegevens, dan geen fout op elke pagina: de pagina's die Supabase nodig hebben, melden het zelf.
  const url = process.env.SUPABASE_URL;
  const sleutel = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !sleutel) return antwoord;

  const supabase = createServerClient(url, sleutel, {
    cookieOptions: cookieOpties,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(teZetten, headers) {
        for (const { name, value } of teZetten) request.cookies.set(name, value);
        antwoord = doorNaarPagina(request, csp);
        for (const { name, value, options } of teZetten) antwoord.cookies.set(name, value, options);
        // Een antwoord met een sessie mag nooit in een gedeelde cache komen (review PR10-09).
        for (const [naam, waarde] of Object.entries(headers)) antwoord.headers.set(naam, waarde);
      },
    },
  });
  // getClaims ververst een verlopen sessie. Wie er is ingelogd, beslist de pagina zelf (met getUser).
  await hooguit(MAXIMAAL_WACHTEN_MS, supabase.auth.getClaims());
  return antwoord;
}

// Geen matcher: de middleware draait bij alles wat bij de Worker komt. Bestaande vaste bestanden serveert Cloudflare
// zonder de Worker; een bestand dat niet bestaat, wordt een 404-pagina, en ook die krijgt zo een CSP (review
// PR10-04). Uitzonderingen in een matcher volgt OpenNext bovendien maar gedeeltelijk (review PR10-06).
