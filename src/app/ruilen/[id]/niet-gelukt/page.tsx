import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { rolLabel } from '@/lib/ledenactiviteit';
import { langeDag } from '@/lib/programma';
import { leesNietGelukt, leesTaak, ruilHref } from '@/lib/ruilen';

import stijl from '../../../afmelden/afmelden.module.css';
import { laadOverdracht } from '../../context';
import { leesDienstVan, leesLidNaam, leesVervangers } from '../../gegevens';

export const metadata: Metadata = { title: 'Dit lid kan niet overnemen – Ledenplatform' };

/**
 * Een overdracht die niet doorging (UC-002 AF-1 en AF-2, wireframes ruilen-fout-afgemeld en ruilen-fout-dubbel): de gekozen vervanger
 * heeft zich net afgemeld of staat al op een plek, terwijl het lid aan het kiezen was. Er is niets gewijzigd: de pagina toont wat er
 * werkelijk staat, uit de database, en laat iemand anders kiezen. De reden en de vervanger staan in het adres; de pagina geeft alleen
 * de tekst die bij de reden past en vertrouwt de rest niet. Heeft het lid zijn dienst niet meer, dan gaat het naar Start.
 */
export default async function OverdrachtNietGelukt({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reden?: string | string[]; v?: string | string[]; taak?: string | string[] }>;
}) {
  const ctx = await laadOverdracht(params);
  if (!ctx.dienst) redirect('/');
  const zoek = await searchParams;
  const reden = leesNietGelukt(zoek.reden);
  const vervangerId = z.uuid().safeParse(zoek.v);
  const taak = leesTaak(zoek.taak);
  const { activiteit, dienst } = ctx;
  if (!reden || !vervangerId.success) redirect(ruilHref(activiteit.id, taak));

  // Wat het adres beweert, controleert de pagina met wat dit lid zelf mag lezen: de vervanger staat in de lijst met de reden uit het adres
  // (afgemeld, al ingedeeld), of staat er niet in (een reden "ongeldig": een externe helper, een inactief lid, iemand buiten de doelgroep).
  // Klopt het niet, dan is er niets misgegaan en gaat het lid terug naar de lijst.
  const vervanger = (await leesVervangers(ctx.supabase, activiteit.id)).find(
    (v) => v.id === vervangerId.data,
  );
  const klopt =
    reden === 'afgemeld'
      ? vervanger?.reden === 'afgemeld'
      : reden === 'dubbel'
        ? vervanger?.reden === 'al_ingedeeld'
        : vervanger === undefined;
  if (!klopt) redirect(ruilHref(activiteit.id, taak));

  const naam = (await leesLidNaam(ctx.supabase, vervangerId.data)) ?? 'Deze persoon';
  const vervangerDienst =
    reden === 'dubbel' ? await leesDienstVan(ctx.supabase, activiteit.id, vervangerId.data) : null;
  const vervangerRol = vervangerDienst ? (rolLabel(vervangerDienst.rol) ?? vervangerDienst.rol) : null;
  const rol = rolLabel(dienst.rol) ?? dienst.rol;
  const eigenNaam = `${ctx.gebruiker.voornaam} ${ctx.gebruiker.achternaam}`;

  const titel = reden === 'dubbel' ? 'Dit lid staat al ingedeeld' : 'Dit lid kan de dienst niet overnemen';
  const uitleg =
    reden === 'afgemeld'
      ? `${naam} heeft zich net afgemeld voor ${activiteit.naam}, terwijl jij aan het kiezen was. Iemand die er niet is kan geen dienst overnemen. Kies een ander lid.`
      : reden === 'dubbel'
        ? `${naam} is net ${vervangerRol ? `als ${vervangerRol.toLowerCase()} ` : ''}ingedeeld bij ${activiteit.naam}, terwijl jij aan het kiezen was. Iemand kan maar één dienst per activiteit hebben. Kies een ander lid.`
        : `${naam} kan deze dienst niet overnemen. Kies een ander lid.`;

  return (
    <Schermkader
      actief="start"
      titel={titel}
      terug={{ href: ruilHref(activiteit.id, taak), tekst: 'Terug naar de lijst' }}
    >
      <Melding soort="let-op" rol="status">
        {uitleg}
      </Melding>
      <Kaart titel="Er is niets gewijzigd">
        <p className={stijl.tekst}>
          Je staat nog steeds zelf op je dienst als {rol.toLowerCase()}. Er is geen lege plek ontstaan.
        </p>
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
            <dt>Nog steeds bezet door</dt>
            <dd>{eigenNaam} (jij)</dd>
          </div>
        </dl>
      </Kaart>
      <div className={stijl.knoppen}>
        <Knop href={ruilHref(activiteit.id, taak)}>Iemand anders kiezen</Knop>
        <Knop href="/" soort="tekst">
          Terug naar start
        </Knop>
      </div>
    </Schermkader>
  );
}
