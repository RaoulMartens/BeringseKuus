// Beveiligingsheaders voor elke pagina (bouwgids 14.4).
//
// 'unsafe-inline' bij scripts is een bewuste, tijdelijke keuze: de App Router van Next.js zet inline scripts in
// de pagina, en die zonder 'unsafe-inline' toestaan vraagt een nonce per aanvraag via een proxy. Of zo'n proxy
// op Cloudflare Workers werkt, is precies wat fase 0 stap E moet bewijzen. Daarna wordt dit strakker.

export type Omgeving = 'development' | 'production';

export interface Header {
  key: string;
  value: string;
}

export function contentSecurityPolicy(omgeving: Omgeving): string {
  const ontwikkeling = omgeving === 'development';
  const bronnen = [
    "default-src 'self'",
    // Next.js in ontwikkeling gebruikt eval voor snel herladen; in productie niet.
    ontwikkeling ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
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

export function beveiligingsheaders(omgeving: Omgeving): Header[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(omgeving) },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Voor oudere browsers die frame-ancestors niet kennen.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}
