// Beveiligingsheaders (bouwgids 14.4), op drie plekken gebruikt:
//
// - src/middleware.ts zet bij elke pagina de CSP met een nieuwe nonce (contentSecurityPolicy). Alleen scripts met die
//   nonce mogen draaien; Next.js geeft zijn eigen scripts de nonce mee (proefroute 2, docs/hosting.md).
// - next.config.ts zet de overige headers op alles wat de Worker antwoordt (vasteHeaders).
// - public/_headers geeft de vaste bestanden, die Cloudflare zonder de Worker serveert, dezelfde overige headers
//   plus een CSP die niets toestaat (headersVasteBestanden). Een unittest houdt dat bestand gelijk aan deze code.

export type Omgeving = 'development' | 'production';

export interface Header {
  key: string;
  value: string;
}

export function contentSecurityPolicy(omgeving: Omgeving, nonce: string): string {
  const ontwikkeling = omgeving === 'development';
  const bronnen = [
    "default-src 'self'",
    // 'strict-dynamic': een script met de nonce mag de scripts laden die het zelf nodig heeft. Next.js in
    // ontwikkeling gebruikt eval voor snel herladen; in productie niet.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${ontwikkeling ? " 'unsafe-eval'" : ''}`,
    // Stijlen houden 'unsafe-inline': een nonce werkt niet voor style-attributen, en een stijl voert geen code uit.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // De websocket voor snel herladen bestaat alleen in ontwikkeling.
    ontwikkeling ? "connect-src 'self' ws:" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return bronnen.join('; ');
}

/** Een nonce per aanvraag: 128 willekeurige bits, base64. */
export function nieuweNonce(): string {
  return btoa(crypto.randomUUID());
}

/** Alle headers behalve de CSP; die verschilt per aanvraag. */
export function vasteHeaders(): Header[] {
  return [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Voor oudere browsers die frame-ancestors niet kennen.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}

/** Voor de vaste bestanden: die voeren nooit zelf code uit, dus de CSP staat niets toe. */
export const CSP_VASTE_BESTANDEN =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export function headersVasteBestanden(): Header[] {
  return [{ key: 'Content-Security-Policy', value: CSP_VASTE_BESTANDEN }, ...vasteHeaders()];
}
