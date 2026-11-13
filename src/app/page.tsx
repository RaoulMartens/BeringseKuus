import { redirect } from 'next/navigation';

import { Jouwstatus } from '@/components/jouwstatus/jouwstatus';
import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Schermkader } from '@/components/schermkader/schermkader';
import { WieKomter } from '@/components/wiekomter/wiekomter';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { dagLabel, kiesWelkom } from '@/lib/ledenactiviteit';
import { splitsDiensten } from '@/lib/mijndiensten';
import { vandaagInNederland } from '@/lib/programma';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';
import { VERENIGING } from '@/lib/vereniging';

import { Activiteitblok, maakStatusRegel } from './activiteitblok';
import { Dienstenkaart } from './dienstenkaart';
import { leesIndelingen, leesKomendeActiviteiten, leesWieKomtEr } from './ledenactiviteit';
import { leesDiensten } from './programma/mijn/gegevens';
import stijl from './ledenscherm.module.css';

/**
 * Het welkomscherm (UC-001): "Alaaf, [voornaam]" en de activiteit van vandaag of de eerstvolgende, met de tijden, de plaats,
 * de rolbezetting en wat er over jou staat. Twee activiteiten op één dag staan onder elkaar op tijd (AF-8); is er niets
 * gepland, dan een lege staat (AF-1). Wie niet is ingelogd ziet wat er is en waar die naartoe kan (review F1-18).
 */
export default async function Startpagina() {
  if (!(await huidigeAuthGebruiker())) {
    return (
      <Schermkader gast titel="Ledenplatform">
        <Kaart titel="In aanbouw">
          <p>Dit platform is in aanbouw. Heb je al toegang, log dan in om het programma te bekijken.</p>
          <p>
            <Knop href="/inloggen">Inloggen</Knop>
          </p>
        </Kaart>
      </Schermkader>
    );
  }

  // Een sessie zonder lid (bijvoorbeeld een uitgenodigde die nog niet is gekoppeld) heeft hier niets te zien.
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/mijn');

  const supabase = await maakSupabase();
  const nu = new Date();
  const vandaag = vandaagInNederland(nu);
  const activiteiten = kiesWelkom(await leesKomendeActiviteiten(supabase, nu), vandaag, nu);
  const titel = `${VERENIGING.groet}, ${gebruiker.voornaam}`;

  if (activiteiten.length === 0) {
    return (
      <Schermkader actief="start" titel={titel} groot>
        <Kaart titel="Er staat op dit moment niets gepland">
          <p className={stijl.leeg}>
            Zodra er weer iets op het programma staat, zie je het hier. {VERENIGING.motto}.
          </p>
        </Kaart>
      </Schermkader>
    );
  }

  const activiteitIds = activiteiten.map((a) => a.id);
  const [indelingen, rasters] = await Promise.all([
    leesIndelingen(supabase, activiteitIds, gebruiker.lidId),
    leesWieKomtEr(supabase, activiteitIds, gebruiker.lidId),
  ]);
  // Wie komt er (UC-010): onder de status, per activiteit; op een telefoon onderaan, na de rolbezetting.
  const wieKomter = activiteiten.map((activiteit) => {
    const raster = rasters.get(activiteit.id);
    return raster ? (
      <WieKomter
        key={activiteit.id}
        raster={raster}
        activiteit={activiteit.naam}
        metNaam={activiteiten.length > 1}
      />
    ) : null;
  });
  const regels = activiteiten.flatMap((activiteit) => {
    const indeling = indelingen.get(activiteit.id);
    return indeling
      ? [maakStatusRegel(activiteit, indeling, gebruiker.lidId, gebruiker.isBeheerder, nu)]
      : [];
  });

  // Mijn diensten (UC-007): staat het lid zelf in de rolbezetting, dan is de ingang "Al je diensten" op die rij; anders een kaart onder
  // de statuskaart met hoeveel diensten er komen.
  const heeftEigenRij = activiteiten.some((activiteit) =>
    indelingen.get(activiteit.id)?.plekken.some((plek) => plek.lidId === gebruiker.lidId),
  );
  const aantalDiensten = heeftEigenRij ? 0 : splitsDiensten(await leesDiensten(supabase), nu).komend.length;
  const dienstenkaart = heeftEigenRij ? null : <Dienstenkaart aantal={aantalDiensten} />;

  return (
    <Schermkader
      actief="start"
      titel={titel}
      groot
      zijkolom={
        <div className={stijl.nietOpMobiel}>
          <Jouwstatus regels={regels} />
          {dienstenkaart}
          {wieKomter}
        </div>
      }
    >
      <div className={stijl.alleenMobiel}>
        <Jouwstatus regels={regels} />
        {dienstenkaart}
      </div>
      {activiteiten.map((activiteit) => {
        const indeling = indelingen.get(activiteit.id);
        return indeling ? (
          <Activiteitblok
            key={activiteit.id}
            activiteit={activiteit}
            indeling={indeling}
            eigenLidId={gebruiker.lidId}
            dag={dagLabel(activiteit.datum, vandaag)}
            metNaam
            alleDienstenHref="/programma/mijn"
          />
        ) : null;
      })}
      <div className={stijl.alleenMobiel}>{wieKomter}</div>
    </Schermkader>
  );
}
