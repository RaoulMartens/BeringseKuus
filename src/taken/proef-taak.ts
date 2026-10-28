// De geplande proeftaak (proefroute 3, Fase-0-plan 4). Cloudflare start hem elke minuut (worker.ts); hij schrijft
// een rij met de minuut als sleutel, en verstuurt hooguit één keer een testbericht. Wegwerp: in fase 7 komt hier
// de echte taak (de dagmelding), met hetzelfde patroon.
//
// Bewust zonder pakketten, met gewone fetch-aanroepen naar Supabase en Resend: de uitrolstap installeert geen
// afhankelijkheden van de app (review PR8-03), en bundelt dit bestand zoals het is.

export interface ProefTaakDiensten {
  registreer(minuut: string, status: 'gelukt' | 'mislukt', melding?: string): Promise<void>;
  /** Claimt het ene testbericht; true als deze run de eerste is. */
  claimBericht(): Promise<boolean>;
  stuurBericht(): Promise<void>;
}

/** De geheimen en instellingen van de Worker die de taak gebruikt (docs/hosting.md stap 12). */
export interface ProefTaakOmgeving {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_AFZENDER?: string;
  PROEF_TAAK_ONTVANGER?: string;
  PROEF_TAAK_FORCEER_FOUT?: string;
}

/** De minuut in UTC, als "2026-10-28T14:07Z". Twee starts in dezelfde minuut krijgen dezelfde sleutel. */
export function minuutSleutel(moment: Date): string {
  return `${moment.toISOString().slice(0, 16)}Z`;
}

export async function voerProefTaakUit(
  moment: Date,
  forceerFout: boolean,
  diensten: ProefTaakDiensten,
): Promise<void> {
  const minuut = minuutSleutel(moment);
  if (forceerFout) {
    // Zichtbaar in de tabel én als mislukte run bij Cloudflare (de fout gaat door naar worker.ts).
    await diensten.registreer(minuut, 'mislukt', 'gedwongen fout (PROEF_TAAK_FORCEER_FOUT)');
    throw new Error('Gedwongen fout in de proeftaak');
  }
  await diensten.registreer(minuut, 'gelukt');
  // Eerst claimen, dan versturen: zo gaat het bericht hooguit één keer, ook als twee runs tegelijk lopen.
  if (await diensten.claimBericht()) await diensten.stuurBericht();
}

/** De echte diensten: de REST-API van Supabase (met de geheime sleutel) en de API van Resend. */
export function maakDiensten(omgeving: ProefTaakOmgeving, ophalen: typeof fetch = fetch): ProefTaakDiensten {
  const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: sleutel } = omgeving;
  if (!url || !sleutel) throw new Error('SUPABASE_URL of SUPABASE_SECRET_KEY ontbreekt bij de Worker');

  const voegToe = (
    tabel: string,
    rij: Record<string, unknown>,
    bijDubbel: 'negeer' | 'meld',
  ): Promise<Response> =>
    ophalen(`${url}/rest/v1/${tabel}`, {
      method: 'POST',
      headers: {
        apikey: sleutel,
        Authorization: `Bearer ${sleutel}`,
        'Content-Type': 'application/json',
        Prefer: bijDubbel === 'negeer' ? 'resolution=ignore-duplicates,return=minimal' : 'return=minimal',
      },
      body: JSON.stringify(rij),
    });

  const berichtIngesteld = Boolean(
    omgeving.RESEND_API_KEY && omgeving.RESEND_AFZENDER && omgeving.PROEF_TAAK_ONTVANGER,
  );

  return {
    async registreer(minuut, status, melding) {
      const antwoord = await voegToe('proef_taak', { minuut, status, melding: melding ?? null }, 'negeer');
      if (!antwoord.ok) throw new Error(`proef_taak schrijven mislukt: status ${antwoord.status}`);
    },
    async claimBericht() {
      // Zonder Resend-gegevens geen bericht; de taak zelf draait gewoon door.
      if (!berichtIngesteld) return false;
      const antwoord = await voegToe('proef_taak_bericht', { id: 1 }, 'meld');
      if (antwoord.status === 409) return false;
      if (!antwoord.ok) throw new Error(`testbericht claimen mislukt: status ${antwoord.status}`);
      return true;
    },
    async stuurBericht() {
      const antwoord = await ophalen('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${omgeving.RESEND_API_KEY ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: omgeving.RESEND_AFZENDER,
          to: [omgeving.PROEF_TAAK_ONTVANGER],
          subject: 'Proef: de geplande taak werkt',
          text: 'Dit bericht komt één keer, van de geplande taak op de Worker (fase 0, proefroute 3).',
        }),
      });
      if (!antwoord.ok) throw new Error(`testbericht versturen mislukt: status ${antwoord.status}`);
    },
  };
}
