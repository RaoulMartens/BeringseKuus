'use client';

// De bevestigingspagina van "Nieuw lid": wat er wordt toegevoegd en dat er een mail naar het lid gaat. Werkwoord op de knop en Annuleren (terug naar
// het ingevulde formulier). Zonder ingevulde gegevens (direct hier geopend) of na een fout van de database gaat de beheerder terug naar het formulier.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';

import stijl from '../../leden.module.css';
import { useNieuwLid } from '../nieuwlidstaat';

export function Nieuwlidbevestigen({ groepen }: { groepen: { id: string; naam: string }[] }) {
  const { waarden, nodig, staat, voerUit, bezig } = useNieuwLid();
  const router = useRouter();
  const leeg = nodig.length > 0;
  // Alleen een fout van deze keer telt: een oude fout in de gedeelde staat stuurt je niet meteen weer terug.
  const [begin] = useState(staat);
  const mislukt = staat !== begin && staat.melding !== null;

  useEffect(() => {
    if (leeg || mislukt) router.replace('/beheer/leden/nieuw');
  }, [leeg, mislukt, router]);

  if (leeg) return null;

  const naam = `${waarden.voornaam.trim()} ${waarden.achternaam.trim()}`;
  const email = waarden.email.trim().toLowerCase();
  const gekozen = groepen.filter((g) => waarden.groepen.includes(g.id)).map((g) => g.naam);

  return (
    <form action={voerUit} className={stijl.formulier}>
      <input type="hidden" name="voornaam" value={waarden.voornaam} />
      <input type="hidden" name="achternaam" value={waarden.achternaam} />
      <input type="hidden" name="email" value={waarden.email} />
      <input type="hidden" name="telefoon" value={waarden.telefoon} />
      {waarden.groepen.map((id) => (
        <input key={id} type="hidden" name="groep" value={id} />
      ))}
      {waarden.aanmerkingen.map((a) => (
        <input key={a} type="hidden" name="aanmerking" value={a} />
      ))}
      <Kaart titel={naam} label>
        <dl className={stijl.gegevens}>
          <div>
            <dt>E-mailadres</dt>
            <dd>{email}</dd>
          </div>
          <div>
            <dt>Groepen</dt>
            <dd>{gekozen.join(' · ')}</dd>
          </div>
          <div>
            <dt>Telefoon</dt>
            <dd>{waarden.telefoon.trim() || 'Nog niet ingevuld'}</dd>
          </div>
        </dl>
      </Kaart>
      <Melding soort="let-op">
        {waarden.voornaam.trim()} krijgt een mail op {email} met uitleg hoe je inlogt (een code per mail). De
        mail gaat binnen een minuut weg.
      </Melding>
      <div className={stijl.knoppen}>
        <Knop type="submit" soort="positief" disabled={bezig}>
          Toevoegen en uitnodigen
        </Knop>
        <Knop href="/beheer/leden/nieuw" soort="tekst">
          Annuleren
        </Knop>
      </div>
    </form>
  );
}
