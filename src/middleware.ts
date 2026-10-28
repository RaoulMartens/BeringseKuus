// De middleware draait vóór elke pagina (proefroute 2, docs/hosting.md). Twee taken:
//
// Bewust middleware.ts met de edge-runtime, niet proxy.ts (Bouwbesluiten 3.1, 28-10-2026). Next.js 16 noemt
// middleware "deprecated" en geeft bij de build een waarschuwing; proxy.ts draait altijd in de Node-runtime, en
// die ondersteunt OpenNext op Workers alleen als experiment. Beide zijn getest; de browsertests in workerd vangen
// het als een update van Next.js of OpenNext dit breekt.
//
// 1. Een CSP met een nieuwe nonce. Next.js leest de nonce uit de CSP in de aanvraag en geeft hem aan zijn eigen
//    scripts; de browser voert dan alleen die scripts uit. Daarom zijn alle pagina's dynamisch (layout.tsx).
// 2. De sessie verversen. Een verlopen sessie wordt hier vernieuwd, en de nieuwe cookie gaat zowel naar de pagina
//    (in de aanvraag) als naar de browser (in het antwoord). Een Server Component kan dat zelf niet.

import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { contentSecurityPolicy, nieuweNonce } from '@/lib/beveiligingsheaders';
import { verplicht } from '@/lib/omgeving';

const omgeving = process.env.NODE_ENV === 'development' ? 'development' : 'production';

/** Laat de aanvraag door naar de pagina, met de CSP in de aanvraag (voor Next.js) en in het antwoord. */
function doorNaarPagina(request: NextRequest, csp: string): NextResponse {
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', csp);
  const antwoord = NextResponse.next({ request: { headers } });
  antwoord.headers.set('Content-Security-Policy', csp);
  return antwoord;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const csp = contentSecurityPolicy(omgeving, nieuweNonce());
  let antwoord = doorNaarPagina(request, csp);

  // Zonder sessiecookie valt er niets te verversen; dan ook geen aanroep naar Supabase.
  if (!request.cookies.getAll().some(({ name }) => name.startsWith('sb-'))) return antwoord;

  const supabase = createServerClient(verplicht('SUPABASE_URL'), verplicht('SUPABASE_PUBLISHABLE_KEY'), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(teZetten) {
        for (const { name, value } of teZetten) request.cookies.set(name, value);
        antwoord = doorNaarPagina(request, csp);
        for (const { name, value, options } of teZetten) antwoord.cookies.set(name, value, options);
      },
    },
  });
  // getClaims ververst een verlopen sessie en controleert het token. Wie er is ingelogd, beslist de pagina zelf.
  await supabase.auth.getClaims();
  return antwoord;
}

export const config = {
  matcher: [
    {
      // Niet voor de vaste bestanden: die serveert Cloudflare zonder de Worker, met hun eigen headers.
      source: '/((?!_next/static|_next/image|favicon.ico|BUILD_ID).*)',
      // Niet voor het vooraf ophalen van links: dat is geen pagina die wordt getoond.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
