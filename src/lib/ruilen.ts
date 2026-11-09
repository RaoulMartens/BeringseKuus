// Je dienst overdragen (UC-002) en afmelden met een dienst (UC-003 AF-1, Datamodel-fase-3.md): waar de pagina's heen gaan, wie een
// dienst kan overdragen en wat de foutcodes van ruil_dienst in woorden zeggen. Alles hier is zuivere logica zonder database,
// zodat de grenzen met tests vast te leggen zijn. De database beslist (ruil_dienst); dit bepaalt wat een lid ervan ziet.

import { leesDetail } from '@/lib/activiteitformulier';

/**
 * De rollen die een lid zelf kan overdragen (R4): alles behalve BOB, eindverantwoordelijke en de bak, die wijzigt alleen het
 * bestuur. Dit spiegelt roltypen.ruilbaar_door_lid; de database blijft leidend (rol_niet_ruilbaar).
 */
export { isRuilbaar } from '@/lib/rollen';

/**
 * Hoort de overdracht bij afmelden? Dan is het stap 1 van 2 (de Stappenbalk) en loopt het lid na de overdracht door naar het
 * afmelden. Wie alleen zijn dienst kwijt wil, doorloopt dezelfde schermen zonder stapaanduiding.
 */
export type Taak = 'afmelden' | null;

export function leesTaak(waarde: string | string[] | undefined): Taak {
  return waarde === 'afmelden' ? 'afmelden' : null;
}

function adres(pad: string, zoek: Record<string, string | null>): string {
  const params = new URLSearchParams();
  for (const [sleutel, waarde] of Object.entries(zoek)) if (waarde) params.set(sleutel, waarde);
  const tekst = params.toString();
  return tekst ? `${pad}?${tekst}` : pad;
}

/** De lijst waaruit je een vervanger kiest. */
export const ruilHref = (id: string, taak: Taak = null): string => adres(`/ruilen/${id}`, { taak });

/** De bevestiging van de overdracht aan deze vervanger. */
export const bevestigHref = (id: string, vervangerId: string, taak: Taak = null): string =>
  adres(`/ruilen/${id}/bevestigen`, { vervanger: vervangerId, taak });

/** Na een gelukte overdracht (zonder afmelden erachter). */
export const geluktHref = (id: string, vervangerId: string): string =>
  adres(`/ruilen/${id}/gelukt`, { v: vervangerId });

/** Stap 2 van afmelden, na een gelukte overdracht. */
export const stap2Href = (id: string, vervangerId: string): string =>
  adres(`/afmelden/${id}`, { stap: '2', v: vervangerId });

export type NietGelukt = 'afgemeld' | 'dubbel' | 'ongeldig';

/** Een overdracht die niet doorging, met wie de vervanger was; de pagina leest zelf wat er klopt. */
export const nietGeluktHref = (
  id: string,
  reden: NietGelukt,
  vervangerId: string,
  taak: Taak = null,
): string => adres(`/ruilen/${id}/niet-gelukt`, { reden, v: vervangerId, taak });

export function leesNietGelukt(waarde: string | string[] | undefined): NietGelukt | null {
  return waarde === 'afgemeld' || waarde === 'dubbel' || waarde === 'ongeldig' ? waarde : null;
}

/** De reden onder een vervanger die niet te kiezen is. */
export function redenTekst(reden: string | null): string {
  if (reden === 'afgemeld') return 'Afgemeld voor deze activiteit';
  if (reden === 'al_ingedeeld') return 'Staat al op een plek bij deze activiteit';
  return 'Kan nu niet overnemen';
}

/** De uitkomst van een overdracht die niet doorgaat: een melding, of een eigen pagina. */
export type RuilUitkomst =
  | { soort: 'melding'; tekst: string }
  | { soort: 'niet-gelukt'; reden: NietGelukt }
  | { soort: 'start' }
  | { soort: 'inloggen' };

const ALGEMEEN =
  'Het overdragen is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het dan weten.';

export function vertaalRuilfout(code: string, detail: unknown): RuilUitkomst {
  switch (code) {
    case 'geen_lid':
      return { soort: 'inloggen' };
    case 'geen_bezetter':
      // De dienst is niet (meer) van dit lid, bijvoorbeeld omdat het bestuur hem net heeft herverdeeld: Start toont de stand.
      return { soort: 'start' };
    case 'rol_niet_ruilbaar':
      return {
        soort: 'melding',
        tekst: 'Deze dienst kun je niet zelf overdragen. Alleen het bestuur wijzigt die.',
      };
    case 'activiteit_niet_open': {
      const reden = leesDetail(detail);
      const wat =
        typeof reden === 'object' && reden !== null ? (reden as Record<string, unknown>).reden : null;
      return {
        soort: 'melding',
        tekst:
          wat === 'afgelopen'
            ? 'Deze activiteit is al geweest; je dienst kun je niet meer overdragen.'
            : wat === 'geannuleerd'
              ? 'Deze activiteit is geannuleerd; je dienst hoeft niet meer te worden overgedragen.'
              : 'Deze activiteit is niet meer open.',
      };
    }
    case 'vervanger_afgemeld':
      return { soort: 'niet-gelukt', reden: 'afgemeld' };
    case 'dubbelboeking':
      return { soort: 'niet-gelukt', reden: 'dubbel' };
    case 'vervanger_ongeldig':
      return { soort: 'niet-gelukt', reden: 'ongeldig' };
    default:
      return { soort: 'melding', tekst: ALGEMEEN };
  }
}
