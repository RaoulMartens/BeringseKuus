import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { afmeldenHref } from '@/lib/afmelden';
import { rolLabel } from '@/lib/ledenactiviteit';
import { langeDag } from '@/lib/programma';

import stijl from '../../../afmelden/afmelden.module.css';
import { laadLid } from '../../context';
import { leesDienstVan, leesLidNaam } from '../../gegevens';

export const metadata: Metadata = { title: 'Dienst overgedragen – Ledenplatform' };

/**
 * Na het overdragen (UC-002 hoofdpad, wireframe ruilen-gelukt): de dienst staat op naam van de vervanger, en jij staat nog wel op
 * aanwezig. Dat de vervanger de dienst echt heeft, controleert de pagina zelf: het adres noemt hem (`?v=`), de database zegt of
 * hij nu die plek heeft. Staat hij er niet, dan is er niets overgedragen en gaat het lid naar Start. Het platform stuurt nog
 * geen bericht (Datamodel-fase-3.md, O-1): het lid heeft het zelf afgestemd (R3), en de pagina zegt dat eerlijk.
 * De primaire knop is het rustige vervolg; Ook afmelden staat eronder als tweede keuze (UX-FLOWS, "De primaire knop duwt niet").
 */
export default async function Overgedragen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string | string[] }>;
}) {
  const { supabase, activiteit } = await laadLid(params);
  const vervangerId = z.uuid().safeParse((await searchParams).v);
  if (!vervangerId.success) redirect('/');

  const dienst = await leesDienstVan(supabase, activiteit.id, vervangerId.data);
  const naam = dienst ? await leesLidNaam(supabase, vervangerId.data) : null;
  if (!dienst || !naam) redirect('/');
  const rol = rolLabel(dienst.rol) ?? dienst.rol;

  return (
    <Schermkader actief="start" titel={`De dienst staat nu op naam van ${naam}`}>
      <Melding soort="succes">
        De dienst is overgedragen. {naam} is vanaf nu verantwoordelijk voor de dienst als {rol.toLowerCase()}{' '}
        bij {activiteit.naam}. Het platform stuurt nog geen bericht; de afstemming heb je zelf al gedaan.
      </Melding>
      <Kaart titel="Wat is vastgelegd">
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
            <dt>Overgedragen aan</dt>
            <dd>{naam}</dd>
          </div>
        </dl>
      </Kaart>
      <Kaart titel="Je hebt nu geen dienst meer bij deze activiteit">
        <p className={stijl.tekst}>
          Je staat nog wel op aanwezig: je hebt alleen je dienst overgedragen. Kun je helemaal niet komen, dan
          meld je je af.
        </p>
      </Kaart>
      <div className={stijl.knoppen}>
        <Knop href="/">Terug naar start</Knop>
        <Knop href={afmeldenHref(activiteit.id)} soort="secundair">
          Ook afmelden
        </Knop>
      </div>
    </Schermkader>
  );
}
