'use client';

// Het formulier van "E-mailadres corrigeren" (wireframe admin-lid-adres): één veld en de knop met het werkwoord. Slaagt het, dan gaat de beheerder naar
// het overzicht met een melding; faalt het (het adres is van een ander lid, klopt niet), dan staat de reden erboven en blijft het veld staan.

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Veld } from '@/components/veld/veld';

import { corrigeerAdres, type LedenStaat } from '../../acties';
import stijl from '../../leden.module.css';

const START: LedenStaat = { melding: null };

export function Adresformulier({
  lidId,
  voornaam,
  huidig,
}: {
  lidId: string;
  voornaam: string;
  huidig: string;
}) {
  const [staat, voerUit, bezig] = useActionState<LedenStaat, FormData>(corrigeerAdres, START);
  const [nieuw, setNieuw] = useState('');

  return (
    <form action={voerUit} className={stijl.formulier} noValidate>
      <input type="hidden" name="lid_id" value={lidId} />
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}{' '}
          {staat.bestaand && (
            <Link href={`/beheer/leden/${staat.bestaand.lidId}`}>Naar {staat.bestaand.naam}</Link>
          )}
        </Melding>
      )}
      <Kaart titel="Nu" label>
        <p className={stijl.adres}>{huidig}</p>
        <Veld
          id="email"
          name="email"
          type="email"
          inputMode="email"
          label="Nieuw e-mailadres"
          autoComplete="off"
          maxLength={254}
          hulp={`${voornaam} logt hiermee in. Na het wijzigen krijgt ${voornaam} direct een nieuwe uitnodiging op dit adres; het oude adres werkt dan niet meer.`}
          value={nieuw}
          onChange={(e) => setNieuw(e.target.value)}
        />
      </Kaart>
      <div className={stijl.knoppen}>
        <Knop type="submit" soort="positief" disabled={bezig || nieuw.trim() === ''}>
          Adres wijzigen en uitnodigen
        </Knop>
        <Knop href={`/beheer/leden/${lidId}`} soort="tekst">
          Annuleren
        </Knop>
      </div>
    </form>
  );
}
