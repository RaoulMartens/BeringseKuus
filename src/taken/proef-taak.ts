// De geplande proeftaak (proefroute 3, Fase-0-plan 4). De taken-Worker (taken/worker.ts) start hem elke minuut;
// hij schrijft per minuut de uitkomst, met de minuut als sleutel, en verstuurt hooguit één keer een testbericht.
// Wegwerp: in fase 7 komt hier de echte taak (de dagmelding), met hetzelfde patroon.
//
// Bewust zonder pakketten, met gewone fetch-aanroepen naar Supabase en Resend: de uitrolstap installeert geen
// afhankelijkheden (review PR8-03) en bundelt dit bestand zoals het is. scripts/controleer-poort.ts bewaakt dat.

export interface ProefTaakDiensten {
  /** Schrijft de uitkomst van de minuut; een latere poging in dezelfde minuut overschrijft de eerdere. */
  registreer(minuut: string, status: 'gelukt' | 'mislukt', melding?: string): Promise<void>;
  /** Claimt het ene testbericht; true als deze run de eerste is. */
  claimBericht(): Promise<boolean>;
  stuurBericht(): Promise<void>;
  markeerBericht(status: 'verstuurd' | 'mislukt', fout?: string): Promise<void>;
}

/** De geheimen en instellingen van de taken-Worker (docs/hosting.md stap 12). */
export interface ProefTaakOmgeving {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_AFZENDER?: string;
  PROEF_TAAK_ONTVANGER?: string;
  PROEF_TAAK_FORCEER_FOUT?: string;
}

// Langer wacht de taak niet op Supabase of Resend; anders hangt een run, en elke minuut start er een nieuwe naast
// (review PR12-11).
const MAXIMAAL_WACHTEN_MS = 10_000;

/** De minuut in UTC, als "2026-10-28T14:07Z". Twee starts in dezelfde minuut krijgen dezelfde sleutel. */
export function minuutSleutel(moment: Date): string {
  return `${moment.toISOString().slice(0, 16)}Z`;
}

const alsTekst = (fout: unknown): string => (fout instanceof Error ? fout.message : String(fout));

export async function voerProefTaakUit(
  moment: Date,
  forceerFout: boolean,
  diensten: ProefTaakDiensten,
): Promise<void> {
  const minuut = minuutSleutel(moment);
  if (forceerFout) {
    // Zichtbaar in de tabel én als mislukte run bij Cloudflare (de fout gaat door naar taken/worker.ts).
    await diensten.registreer(minuut, 'mislukt', 'gedwongen fout (PROEF_TAAK_FORCEER_FOUT)');
    throw new Error('Gedwongen fout in de proeftaak');
  }
  try {
    // Eerst claimen, dan versturen: zo gaat het bericht hooguit één keer, ook als twee runs tegelijk lopen. Mislukt
    // het versturen, dan staat dat bij het bericht; opnieuw proberen gaat met de hand (docs/hosting.md stap 12).
    if (await diensten.claimBericht()) {
      try {
        await diensten.stuurBericht();
      } catch (fout) {
        await diensten.markeerBericht('mislukt', alsTekst(fout));
        throw fout;
      }
      await diensten.markeerBericht('verstuurd');
    }
  } catch (fout) {
    // De uitkomst van de run, niet die van de eerste poging (review PR12-03).
    await diensten.registreer(minuut, 'mislukt', alsTekst(fout));
    throw fout;
  }
  await diensten.registreer(minuut, 'gelukt');
}

/**
 * De echte diensten: de REST-API van Supabase (met de geheime sleutel) en de API van Resend. Zonder Supabase-
 * gegevens geen diensten: dan is de taak (nog) niet ingesteld, en stopt de Worker zonder fout.
 */
export function maakDiensten(
  omgeving: ProefTaakOmgeving,
  ophalen: typeof fetch = fetch,
): ProefTaakDiensten | undefined {
  const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: sleutel } = omgeving;
  if (!url || !sleutel) return undefined;

  // De nieuwe geheime sleutel (sb_secret_…) alleen als apikey; het is geen JWT (review PR12-09).
  const supabase = (
    pad: string,
    methode: 'POST' | 'PATCH',
    voorkeur: string,
    rij: object,
  ): Promise<Response> =>
    ophalen(`${url}/rest/v1/${pad}`, {
      method: methode,
      headers: { apikey: sleutel, 'Content-Type': 'application/json', Prefer: voorkeur },
      body: JSON.stringify(rij),
      signal: AbortSignal.timeout(MAXIMAAL_WACHTEN_MS),
    });

  const berichtIngesteld = Boolean(
    omgeving.RESEND_API_KEY && omgeving.RESEND_AFZENDER && omgeving.PROEF_TAAK_ONTVANGER,
  );

  return {
    async registreer(minuut, status, melding) {
      const rij = { minuut, status, melding: melding ?? null };
      const antwoord = await supabase(
        'proef_taak',
        'POST',
        'resolution=merge-duplicates,return=minimal',
        rij,
      );
      if (!antwoord.ok) throw new Error(`proef_taak schrijven mislukt: status ${antwoord.status}`);
    },
    async claimBericht() {
      // Zonder Resend-gegevens geen bericht; de taak zelf draait gewoon door.
      if (!berichtIngesteld) return false;
      // Bestaat de claim al, dan geeft Supabase een lege lijst, zonder fout in de database (review PR12-10).
      const antwoord = await supabase(
        'proef_taak_bericht',
        'POST',
        'resolution=ignore-duplicates,return=representation',
        { id: 1 },
      );
      if (!antwoord.ok) throw new Error(`testbericht claimen mislukt: status ${antwoord.status}`);
      const rijen: unknown = await antwoord.json();
      return Array.isArray(rijen) && rijen.length > 0;
    },
    async stuurBericht() {
      const antwoord = await ophalen('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${omgeving.RESEND_API_KEY ?? ''}`,
          'Content-Type': 'application/json',
          // Opnieuw versturen met dezelfde sleutel stuurt bij Resend geen tweede bericht.
          'Idempotency-Key': 'proef-taak-testbericht',
        },
        body: JSON.stringify({
          from: omgeving.RESEND_AFZENDER,
          to: [omgeving.PROEF_TAAK_ONTVANGER],
          subject: 'Proef: de geplande taak werkt',
          text: 'Dit bericht komt één keer, van de geplande taak op de taken-Worker (fase 0, proefroute 3).',
        }),
        signal: AbortSignal.timeout(MAXIMAAL_WACHTEN_MS),
      });
      if (!antwoord.ok) throw new Error(`testbericht versturen mislukt: status ${antwoord.status}`);
    },
    async markeerBericht(status, fout) {
      const antwoord = await supabase('proef_taak_bericht?id=eq.1', 'PATCH', 'return=minimal', {
        status,
        fout: fout ?? null,
      });
      if (!antwoord.ok)
        throw new Error(`status van het testbericht bijwerken mislukt: status ${antwoord.status}`);
    },
  };
}
