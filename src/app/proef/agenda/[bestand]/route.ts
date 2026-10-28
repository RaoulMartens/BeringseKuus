// Proefroute 1 (Fase-0-plan 4): de agenda-feed als .ics, van de Worker. Wegwerpcode: in fase 1 komt de echte feed
// met het token per lid uit leden_prive (Bouwbesluiten 4.2). Tot dan één verzonnen afspraak en één token, dat als
// geheim PROEF_AGENDA_TOKEN bij de Worker staat (docs/hosting.md).
//
// Het token staat in de URL. Daarom: geen Workers Logs (wrangler.jsonc), niets loggen in deze route, en bij een
// onbekend of vreemd token altijd hetzelfde antwoord, zodat niemand kan afleiden welke tokens bestaan.

import { maakAgenda } from '@/lib/agenda/ics';
import { tokenKlopt } from '@/lib/agenda/token';

const NIET_GEVONDEN = (): Response =>
  new Response('Niet gevonden', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });

/**
 * Alleen over https; anders reist het token onversleuteld (review PR11-01). Een weigering verraadt niets, maar laat
 * een verkeerd ingesteld abonnement wel meteen falen. Uitzondering: de eigen computer, waar de tests over http lopen.
 */
function veiligeVerbinding(aanvraag: Request): boolean {
  const { protocol, hostname } = new URL(aanvraag.url);
  return protocol === 'https:' || hostname === '127.0.0.1' || hostname === 'localhost';
}

export async function GET(
  aanvraag: Request,
  { params }: { params: Promise<{ bestand: string }> },
): Promise<Response> {
  const { bestand } = await params;
  if (!veiligeVerbinding(aanvraag) || !bestand.endsWith('.ics')) return NIET_GEVONDEN();
  if (!(await tokenKlopt(bestand.slice(0, -'.ics'.length), process.env.PROEF_AGENDA_TOKEN)))
    return NIET_GEVONDEN();

  const agenda = maakAgenda(
    'Ledenplatform (proef)',
    [
      {
        uid: 'proef-bonte-avond-2027-01-15@ledenplatform',
        titel: 'Bonte Avond (proef)',
        begin: '2027-01-15T20:11',
        einde: '2027-01-16T01:11',
        locatie: 'Gemeenschapshuis, Kerkstraat 12',
        omschrijving: 'Proef van de agenda-feed. Verzamelen 19:30; bus vertrekt 19:45, vanaf de kerk.',
      },
    ],
    new Date(),
  );
  return new Response(agenda, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // Persoonlijk per lid (straks): nooit in een gedeelde cache.
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="ledenplatform.ics"',
    },
  });
}
