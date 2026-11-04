import type { Metadata } from 'next';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Stappenbalk } from '@/components/stappenbalk/stappenbalk';
import { Vervangerkeuze } from '@/components/vervangerkeuze/vervangerkeuze';
import { rolLabel } from '@/lib/ledenactiviteit';
import { langeDag, tijdTekst } from '@/lib/programma';
import { leesTaak } from '@/lib/ruilen';

import stijl from '../../afmelden/afmelden.module.css';
import { laadOverdracht } from '../context';
import { GeenOverdracht } from '../geen-overdracht';
import { leesContact, leesVervangers } from '../gegevens';

export const metadata: Metadata = { title: 'Dienst overdragen – Ledenplatform' };

/**
 * Stap 1 van het overdragen (UC-002 stap 1 tot en met 5): wie neemt je dienst over? De afstemming gebeurt buiten de app; hier leg je
 * alleen de uitkomst vast (R3). Wie niet te kiezen is, staat er grijs bij met de reden. Hoort de overdracht bij afmelden
 * (`?taak=afmelden`), dan staat de Stappenbalk erbij en loopt het lid na de bevestiging door naar het afmelden (UC-003 AF-1).
 * Deze pagina wijzigt niets: het formulier gaat naar de bevestiging.
 */
export default async function KiesVervanger({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ taak?: string | string[] }>;
}) {
  const ctx = await laadOverdracht(params);
  if (ctx.kanNiet || !ctx.dienst)
    return <GeenOverdracht activiteit={ctx.activiteit} reden={ctx.kanNiet ?? ''} />;

  const taak = leesTaak((await searchParams).taak);
  const { activiteit, dienst } = ctx;
  const [vervangers, contact] = await Promise.all([
    leesVervangers(ctx.supabase, activiteit.id),
    leesContact(ctx.supabase, activiteit.id),
  ]);
  const rol = rolLabel(dienst.rol) ?? dienst.rol;
  const tijden = [
    tijdTekst(activiteit.verzameltijd) ? `Verzamelen ${tijdTekst(activiteit.verzameltijd)}` : null,
    tijdTekst(activiteit.starttijd) ? `start ${tijdTekst(activiteit.starttijd)}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const kiesbaar = vervangers.some((v) => v.beschikbaar);

  return (
    <Schermkader
      actief="start"
      titel="Wie neemt je dienst over?"
      terug={{ href: '/', tekst: 'Terug naar start' }}
    >
      {taak && (
        <Stappenbalk
          stappen={[
            { label: 'vervanger aanwijzen', status: 'huidig' },
            { label: 'afmelden bevestigen', status: 'komt' },
          ]}
        />
      )}
      <p className={stijl.tekst}>
        Regel zelf even met diegene dat hij of zij je dienst als {rol.toLowerCase()} overneemt; hier leg je
        alleen de uitkomst vast. Na bevestigen is de dienst direct van de ander, zonder goedkeuring.
      </p>
      <form method="get" action={`/ruilen/${activiteit.id}/bevestigen`} className={stijl.formulier}>
        {taak && <input type="hidden" name="taak" value={taak} />}
        <Kaart titel="Dienst die je overdraagt">
          <dl className={stijl.rijen}>
            <div className={stijl.rij}>
              <dt>Rol</dt>
              <dd>{rol}</dd>
            </div>
            <div className={stijl.rij}>
              <dt>Activiteit</dt>
              <dd>
                {activiteit.naam} — {langeDag(activiteit.datum)}
              </dd>
            </div>
            {tijden && (
              <div className={stijl.rij}>
                <dt>Tijden</dt>
                <dd>{tijden}</dd>
              </div>
            )}
          </dl>
        </Kaart>
        {kiesbaar ? (
          <Vervangerkeuze vervangers={vervangers} />
        ) : (
          <Kaart titel="Niemand kan nu overnemen">
            <p className={stijl.tekst}>
              Er is op dit moment niemand beschikbaar om je dienst over te nemen. Je dienst blijft bij jou
              staan.
            </p>
          </Kaart>
        )}
        <div className={stijl.knoppen}>
          {kiesbaar && <Knop type="submit">Verder</Knop>}
          <Knop href="/" soort="tekst">
            Annuleren
          </Knop>
        </div>
      </form>
      <Kaart titel="Geen vervanger gevonden?">
        <p className={stijl.tekst}>
          {taak
            ? 'Dan kun je je niet afmelden en blijft de dienst bij jou staan. Er wordt niets automatisch vrijgegeven.'
            : 'Dan blijft de dienst bij jou staan. Er wordt niets automatisch vrijgegeven.'}
        </p>
        {contact && (
          <p className={stijl.tekst}>
            Kom je er niet uit? Bel {contact.naam}, de eindverantwoordelijke:{' '}
            <a href={`tel:${contact.telefoon.replace(/[^\d+]/g, '')}`}>{contact.telefoon}</a>.
          </p>
        )}
      </Kaart>
    </Schermkader>
  );
}
