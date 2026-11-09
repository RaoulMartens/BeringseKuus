// Publiceren (UC-004 stap 10, wireframe admin-publiceren): wat de bevestigingspagina zegt over de activiteit, en de
// foutcodes van het publiceren in woorden. Alles hier is zuivere logica zonder database.
//
// De pagina vraagt eerst om een bevestiging, want publiceren raakt anderen en kan niet terug (BA-3): leden zien de
// activiteit, en een concept wordt nooit meer een concept. Er staat bewust niet dat iemand bericht krijgt: dat gaat in
// deze versie nog niet uit (Datamodel-fase-2.md, O-1).

import { opsomming } from '@/lib/beheeroverzicht';
import { plekAantal, vergelijkRollen } from '@/lib/rollen';

export interface PlekVoorBevestiging {
  rol: string;
  bezetterId: string | null;
}

/** "1 werker-plek, 2 drankhaler-plekken": wat er nog leeg is (zonder de eindverantwoordelijke, die moet er zijn); leeg als alles is ingedeeld. */
export function nogLeegTekst(plekken: PlekVoorBevestiging[]): string | null {
  const leeg = plekken.filter(
    (plek) => plek.bezetterId === null && plek.rol !== 'eindverantwoordelijke' && plek.rol !== 'bak',
  );
  const rollen = [...new Set(leeg.map((plek) => plek.rol))].sort(vergelijkRollen);
  const delen = rollen.map((rol) => plekAantal(rol, leeg.filter((plek) => plek.rol === rol).length));
  return delen.length > 0 ? delen.join(', ') : null;
}

/** Het aantal verschillende mensen dat is ingedeeld, de eindverantwoordelijke meegeteld. */
export function aantalIngedeeld(
  plekken: PlekVoorBevestiging[],
  eindverantwoordelijkeId: string | null,
): number {
  const ids = new Set(plekken.flatMap((plek) => (plek.bezetterId ? [plek.bezetterId] : [])));
  if (eindverantwoordelijkeId) ids.add(eindverantwoordelijkeId);
  return ids.size;
}

/** "Alle 42 actieve leden", of "Alleen leden van Bestuur en Raad van Elf" bij een doelgroep (R22). */
export function zichtbaarVoorTekst(
  gekozenGroepen: string[],
  groepen: { id: string; naam: string }[],
  aantalLeden: number,
): string {
  const namen = gekozenGroepen.flatMap((id) => {
    const groep = groepen.find((g) => g.id === id);
    return groep ? [groep.naam] : [];
  });
  if (namen.length === 0) return `Alle ${aantalLeden} actieve leden`;
  return `Alleen leden van ${opsomming(namen)}`;
}

/**
 * Een beheerder die publiceert voor een groep waar hij zelf niet in zit, ziet de activiteit zelf niet op Start of Programma
 * (R22: wie niet in de doelgroep zit, ziet hem niet; het bestuur heeft hierin geen uitzondering). Dat is een hint, geen
 * blokkade: de tekst zegt het vooraf, zodat een lege Start na het publiceren niet verrast. Null als de beheerder de
 * activiteit wel ziet: er is geen doelgroep (iedereen ziet hem) of hij zit in minstens een van de gekozen groepen.
 */
export function zelfNietZichtbaarTekst(
  gekozenGroepen: string[],
  groepen: { id: string; naam: string }[],
  eigenGroepen: string[],
): string | null {
  const namen = gekozenGroepen.flatMap((id) => {
    const groep = groepen.find((g) => g.id === id);
    return groep ? [groep.naam] : [];
  });
  if (namen.length === 0) return null;
  if (gekozenGroepen.some((id) => eigenGroepen.includes(id))) return null;
  return `Jij zit zelf niet in ${opsomming(namen)}, dus je ziet deze activiteit zelf niet op Start of Programma. Leden in ${namen.length === 1 ? 'die groep' : 'die groepen'} zien hem wel.`;
}

const ONTBREEKT: Record<string, string> = {
  starttijd: 'de starttijd',
  eindtijd: 'de eindtijd',
  locatie: 'de locatie',
  eindverantwoordelijke: 'een eindverantwoordelijke',
  telefoon_eindverantwoordelijke: 'het telefoonnummer van de eindverantwoordelijke',
};

function lijstUit(detail: unknown, sleutel: string): string[] {
  if (typeof detail !== 'object' || detail === null) return [];
  const waarde: unknown = (detail as Record<string, unknown>)[sleutel];
  return Array.isArray(waarde) ? waarde.filter((deel): deel is string => typeof deel === 'string') : [];
}

/** De foutcode van het publiceren als tekst voor de bevestigingspagina. */
export function vertaalPubliceerfout(code: string, detail: unknown): string {
  switch (code) {
    case 'publiceren_niet_mogelijk': {
      const nodig = lijstUit(detail, 'ontbreekt').flatMap((veld) => {
        const tekst = ONTBREEKT[veld];
        return tekst ? [tekst] : [];
      });
      return nodig.length > 0
        ? `Publiceren kan nog niet: er ontbreekt ${opsomming(nodig)}. Vul dat eerst in en probeer het opnieuw.`
        : 'Publiceren kan nog niet: er ontbreekt nog iets. Ga terug naar de activiteit en kijk wat er nog nodig is.';
    }
    case 'versie_verouderd':
      return 'Iemand anders heeft deze activiteit net gewijzigd. Ga terug naar de activiteit, kijk of het nog klopt, en probeer het nog eens.';
    case 'alleen_concept':
      return 'Deze activiteit is al gepubliceerd.';
    case 'activiteit_niet_open':
      return 'Deze activiteit is al geweest of geannuleerd en kan niet meer worden gepubliceerd.';
    case 'activiteit_onbekend':
      return 'Deze activiteit bestaat niet meer.';
    default:
      return 'Het publiceren is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het dan weten.';
  }
}
