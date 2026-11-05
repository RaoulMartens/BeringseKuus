import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Stappenbalk } from '@/components/stappenbalk/stappenbalk';
import { rolLabel } from '@/lib/ledenactiviteit';
import { langeDag } from '@/lib/programma';
import { leesTaak, ruilHref } from '@/lib/ruilen';

import stijl from '../../../afmelden/afmelden.module.css';
import { laadOverdracht } from '../../context';
import { GeenOverdracht } from '../../geen-overdracht';
import { leesVervangers } from '../../gegevens';

import { Ruilformulier } from './ruilformulier';

export const metadata: Metadata = { title: 'Dienst overdragen bevestigen – Ledenplatform' };

/**
 * De bevestiging van het overdragen (UC-002 stap 6, wireframes ruilen-bevestigen en afmelden-stap1-bevestigen): wie neemt over, en dat
 * het lid dit niet zelf kan terugdraaien. Deze pagina wijzigt niets; de knop roept ruilDienst aan. Is de gekozen vervanger niet
 * (meer) te kiezen, dan gaat het lid terug naar de lijst. Wat in de tussentijd misgaat, vangt de database op bij het bevestigen.
 */
export default async function BevestigOverdracht({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vervanger?: string | string[]; taak?: string | string[] }>;
}) {
  const ctx = await laadOverdracht(params);
  if (ctx.kanNiet || !ctx.dienst)
    return <GeenOverdracht activiteit={ctx.activiteit} reden={ctx.kanNiet ?? ''} />;

  const zoek = await searchParams;
  const taak = leesTaak(zoek.taak);
  const { activiteit, dienst } = ctx;
  const terugHref = ruilHref(activiteit.id, taak);

  const vervangerId = z.uuid().safeParse(zoek.vervanger);
  if (!vervangerId.success) redirect(terugHref);
  const vervangers = await leesVervangers(ctx.supabase, activiteit.id);
  const gekozen = vervangers.find((v) => v.id === vervangerId.data && v.beschikbaar);
  if (!gekozen) redirect(terugHref);

  const rol = rolLabel(dienst.rol) ?? dienst.rol;
  const eigenNaam = `${ctx.gebruiker.voornaam} ${ctx.gebruiker.achternaam}`;

  return (
    <Schermkader
      actief="start"
      titel={`Dienst overdragen aan ${gekozen.naam}?`}
      terug={{ href: terugHref, tekst: 'Terug naar de lijst' }}
    >
      {taak && (
        <Stappenbalk
          stappen={[
            { label: 'vervanger aanwijzen', status: 'huidig' },
            { label: 'afmelden bevestigen', status: 'komt' },
          ]}
        />
      )}
      <Kaart titel={`Je draagt je dienst over aan ${gekozen.naam}`}>
        <dl className={stijl.rijen}>
          <div className={stijl.rij}>
            <dt>Activiteit</dt>
            <dd>
              {activiteit.naam} — {langeDag(activiteit.datum)}
            </dd>
          </div>
          <div className={stijl.rij}>
            <dt>Rol</dt>
            <dd>{rol}</dd>
          </div>
          <div className={stijl.rij}>
            <dt>Nu bezet door</dt>
            <dd>{eigenNaam} (jij)</dd>
          </div>
          <div className={stijl.rij}>
            <dt>Straks bezet door</dt>
            <dd>{gekozen.naam}</dd>
          </div>
        </dl>
        <p className={stijl.tekst}>
          Zodra je bevestigt is de dienst van {gekozen.naam} en is die verantwoordelijk. Dit kun je niet zelf
          terugdraaien — alleen het bestuur kan een indeling nog wijzigen. {gekozen.naam} krijgt hier geen
          bericht van: zorg dat die het weet.
          {taak ? ' Daarna volgt stap 2: je afmelding zelf.' : ''}
        </p>
      </Kaart>
      <Ruilformulier
        activiteitId={activiteit.id}
        vervangerId={gekozen.id}
        rol={dienst.rol}
        taak={taak}
        terugHref={terugHref}
      />
    </Schermkader>
  );
}
