// MFA voor het bestuur (stap D). De regels staan in de database (intern.is_beheerder, public.beheerstatus); dit bestand
// vertaalt wat de database zegt naar een scherm en controleert de code die iemand intypt.

/**
 * Hoe lang een ingevoerde code beheer geeft. Gelijk aan 12 * 3600 in intern.code_recent() (migratie
 * 20261029110000_fase1_mfa.sql); mfa.test.ts leest die migratie en houdt de twee gelijk.
 */
export const CODE_GELDIG_UUR = 12;

export const BEHEERSTATUSSEN = [
  'geen_lid',
  'geen_beheerder',
  'mfa_instellen',
  'wacht_op_bevestiging',
  'code_nodig',
  'ok',
] as const;

export type Beheerstatus = (typeof BEHEERSTATUSSEN)[number];

/** Een antwoord van de database als status; alles wat niet in de lijst staat, is geen status (dan geen beheer). */
export function leesBeheerstatus(waarde: unknown): Beheerstatus | null {
  return BEHEERSTATUSSEN.find((status) => status === waarde) ?? null;
}

/** Waar een beheerpagina iemand heen stuurt, of null als beheer mag doorgaan. */
export function routeVoorBeheerstatus(status: Beheerstatus): string | null {
  switch (status) {
    case 'ok':
      return null;
    case 'geen_lid':
      return '/inloggen';
    case 'geen_beheerder':
      return '/geen-toegang';
    case 'mfa_instellen':
      return '/mfa/instellen';
    case 'wacht_op_bevestiging':
      return '/mfa/wacht';
    case 'code_nodig':
      return '/mfa/code';
  }
}

/** Wat er bij een mislukte code te lezen staat (wireframe mfa-code-fout); de sleutels zijn de foutsoorten van de acties. */
export const CODE_MELDINGEN = {
  code: 'Deze code klopt niet. Typ de nieuwste code uit de app en probeer het nog eens.',
  druk: 'Je hebt te vaak een code geprobeerd. Wacht een paar minuten en probeer het dan opnieuw.',
  sessie: 'Er ging iets mis bij het controleren van de code. Probeer het nog eens.',
  verlopen:
    'Deze QR-code is verlopen. Laad de pagina opnieuw, haal de oude regel uit je app en scan de nieuwe code.',
} as const;

export type CodeFout = keyof typeof CODE_MELDINGEN;

/**
 * Wat een fout van Supabase bij het controleren van een code voor de gebruiker betekent (review PR23-04). Alleen
 * `mfa_verification_failed` is een foute code; alles wat daarbuiten valt (een verlopen uitdaging, een ander IP-adres bij
 * uitdaging en controle) zou de gebruiker anders ten onrechte zijn goede code laten betwijfelen.
 */
export function codeFoutVoor(fout: { status?: number; code?: string }): CodeFout {
  if (fout.status === 429) return 'druk';
  if (fout.code === 'mfa_verification_failed') return 'code';
  if (fout.code === 'mfa_factor_not_found') return 'verlopen';
  return 'sessie';
}

/** De zes cijfers van de authenticator-app. Spaties ("123 456") zijn toegestaan; al het andere niet. */
export function normaliseerCode(waarde: unknown): string | null {
  if (typeof waarde !== 'string') return null;
  const code = waarde.replace(/\s/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}
