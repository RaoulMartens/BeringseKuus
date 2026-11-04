import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Stappenbalk } from '@/components/stappenbalk/stappenbalk';
import { afgemeldHref, deadlineTekst, maakAanbod } from '@/lib/afmelden';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { rolLabel } from '@/lib/ledenactiviteit';
import { langeDag, tijdTekst } from '@/lib/programma';
import { ruilHref } from '@/lib/ruilen';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { leesDienstVan, leesLidNaam } from '../../ruilen/gegevens';
import { leesAfmeldActiviteit, leesEigenAfmelding, leesEigenRollen } from '../gegevens';
import stijl from '../afmelden.module.css';

import { Afmeldformulier } from './afmeldformulier';

export const metadata: Metadata = { title: 'Afmelden – Ledenplatform' };

/**
 * Afmelden (UC-003). Drie gezichten van dezelfde pagina, naar wat het lid heeft:
 *  - zonder dienst: de bevestiging met een toelichting die alleen het bestuur leest (hoofdpad; de knop roept meldAf aan);
 *  - met een ruilbare dienst: de aankondiging van twee stappen (AF-1, R7): eerst je dienst overdragen, daarna afmelden. De
 *    overdracht kan niet worden teruggedraaid; lukt het afmelden daarna niet, dan sta je aanwezig zonder dienst;
 *  - stap 2, na de overdracht (`?stap=2&v=…`): dezelfde bevestiging met de Stappenbalk en wat er zojuist is gebeurd.
 * Wie hier niet kan afmelden (een beheerrol, de activiteit is geweest) leest waarom; wie al is afgemeld gaat naar het resultaat.
 */
export default async function Afmelden({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stap?: string | string[]; v?: string | string[] }>;
}) {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/mijn');

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const activiteit = await leesAfmeldActiviteit(supabase, id.data);
  if (!activiteit) notFound();

  if (await leesEigenAfmelding(supabase, activiteit.id, gebruiker.lidId))
    redirect(afgemeldHref(activiteit.id));

  const nu = new Date();
  const rollen = await leesEigenRollen(supabase, activiteit.id, gebruiker.lidId);
  const aanbod = maakAanbod(activiteit, nu, false, rollen);
  const terug = { href: '/', tekst: 'Terug naar start' };
  const wat = `${activiteit.naam} — ${langeDag(activiteit.datum)}`;

  if (!aanbod.afmelden) {
    return (
      <Schermkader actief="start" titel="Afmelden kan hier niet" terug={terug}>
        <Kaart titel={wat}>
          <p className={stijl.tekst}>
            {aanbod.hulp ?? 'Voor deze activiteit kun je je niet (meer) afmelden.'}
          </p>
        </Kaart>
      </Schermkader>
    );
  }

  // Met een dienst: eerst overdragen. De aankondiging noemt beide stappen en wat er gebeurt als het halverwege stopt.
  if (rollen.length > 0) {
    const rol = rolLabel(rollen[0] ?? '') ?? rollen[0] ?? 'je dienst';
    return (
      <Schermkader actief="start" titel="Afmelden in twee stappen" terug={terug}>
        <Stappenbalk
          stappen={[
            { label: 'vervanger aanwijzen', status: 'komt' },
            { label: 'afmelden bevestigen', status: 'komt' },
          ]}
        />
        <Kaart titel={wat}>
          <p className={stijl.tekst}>
            Je bent {rol.toLowerCase()}. Een plek mag niet leegvallen, dus eerst draag je die dienst over aan
            een ander lid; daarna meld je je af.
          </p>
          <p className={stijl.tekst}>
            De overdracht kun je niet terugdraaien. Lukt het afmelden daarna niet, dan sta je aanwezig zonder
            dienst.
          </p>
        </Kaart>
        <div className={stijl.knoppen}>
          <Knop href={ruilHref(activiteit.id, 'afmelden')}>Beginnen met stap 1</Knop>
          <Knop href={terug.href} soort="tekst">
            Annuleren
          </Knop>
        </div>
      </Schermkader>
    );
  }

  // Stap 2: de overdracht is gedaan. Het adres noemt de vervanger; de pagina controleert of hij de dienst echt heeft.
  const zoek = await searchParams;
  const vervangerId = zoek.stap === '2' ? z.uuid().safeParse(zoek.v) : null;
  let overdracht: { naam: string; rol: string } | null = null;
  if (vervangerId?.success) {
    const dienst = await leesDienstVan(supabase, activiteit.id, vervangerId.data);
    const naam = dienst ? await leesLidNaam(supabase, vervangerId.data) : null;
    if (dienst && naam) overdracht = { naam, rol: rolLabel(dienst.rol) ?? dienst.rol };
  }

  return (
    <Schermkader actief="start" titel={`Afmelden voor ${activiteit.naam}?`} terug={terug}>
      {overdracht && (
        <>
          <Stappenbalk
            stappen={[
              { label: 'vervanger aangewezen', status: 'klaar' },
              { label: 'afmelden bevestigen', status: 'huidig' },
            ]}
          />
          <Melding soort="succes">
            Je dienst als {overdracht.rol.toLowerCase()} staat nu op naam van {overdracht.naam}. Je hebt geen
            dienst meer, maar je staat nog wel op aanwezig.
          </Melding>
        </>
      )}
      <Kaart titel={wat}>
        <dl className={stijl.rijen}>
          {tijdTekst(activiteit.verzameltijd) && (
            <div className={stijl.rij}>
              <dt>Verzameltijd</dt>
              <dd>{tijdTekst(activiteit.verzameltijd)}</dd>
            </div>
          )}
          {activiteit.locatie && (
            <div className={stijl.rij}>
              <dt>Locatie</dt>
              <dd>{activiteit.locatie}</dd>
            </div>
          )}
          <div className={stijl.rij}>
            <dt>Jouw dienst</dt>
            <dd>{overdracht ? 'Geen' : 'Geen — je kunt je vrij afmelden'}</dd>
          </div>
          <div className={stijl.rij}>
            <dt>Afmeld-deadline</dt>
            <dd>{deadlineTekst(activiteit.afmeldDeadline, nu)}</dd>
          </div>
        </dl>
        <p className={stijl.tekst}>
          Je kunt je afmelding altijd weer intrekken, zolang de activiteit nog niet is geweest.
        </p>
      </Kaart>
      <Afmeldformulier activiteitId={activiteit.id} terugHref={terug.href} />
      {overdracht && (
        <Melding soort="info">
          Stop je hier, of lukt het afmelden niet, bijvoorbeeld omdat er te weinig mensen overblijven, dan
          blijft de overdracht aan {overdracht.naam} staan. Die kun je niet terugdraaien. Je staat dan gewoon
          op aanwezig, zonder dienst.
        </Melding>
      )}
    </Schermkader>
  );
}
