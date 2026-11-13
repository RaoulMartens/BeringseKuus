import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Datumblok } from '@/components/datumblok/datumblok';
import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Schermkader } from '@/components/schermkader/schermkader';
import {
  dagTekst,
  groepeerReeksen,
  isActiviteitStatus,
  maakProgramma,
  programmaLink,
  regelOnderNaam,
  vandaagInNederland,
  type Maand,
  type ProgrammaActiviteit,
} from '@/lib/programma';
import { splitsDiensten } from '@/lib/mijndiensten';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { seizoenTitel } from '@/lib/vereniging';
import { maakSupabase } from '@/lib/supabase/server';

import { leesDiensten } from './mijn/gegevens';
import stijl from './programma.module.css';
import { Reeksrij } from './reeks';
import { Rijstatus } from './rijstatus';
import { Programmawisselaar } from './wisselaar';

export const metadata: Metadata = { title: 'Programma – Ledenplatform' };

// Alleen kolommen die een lid mag lezen (CLAUDE.md: activiteiten altijd met een kolomlijst). Welke activiteiten er
// terugkomen, beslist de database: een lid krijgt alleen gepubliceerde activiteiten voor zijn groepen, een beheerder ook
// de concepten. Deze pagina filtert daar niets op: een tweede filter zou kunnen afwijken van de regels.
const KOLOMMEN = 'id, naam, datum, starttijd, locatie, status, eindigt_om';

function Maandkaart({
  maand,
  vandaag,
  geweest,
  kop,
  zichtbaarAlsLid,
}: {
  maand: Maand;
  vandaag: string;
  geweest: boolean;
  kop: 'h2' | 'h3';
  /** De id's van de activiteiten die dit lid als lid ziet (de view mijn_activiteiten). */
  zichtbaarAlsLid: Set<string>;
}) {
  return (
    <Kaart titel={maand.titel} kop={kop} lijst>
      <Lijst>
        {groepeerReeksen(maand.activiteiten).map((item) => {
          if (item.soort === 'reeks') {
            return (
              <Reeksrij
                key={item.reeks.activiteiten[0]?.id}
                reeks={item.reeks}
                vandaag={vandaag}
                geweest={geweest}
                zichtbaarAlsLid={zichtbaarAlsLid}
              />
            );
          }
          const activiteit = item.activiteit;
          const dag = dagTekst(activiteit.datum);
          const regel = regelOnderNaam(activiteit);
          return (
            <Lijstrij
              key={activiteit.id}
              uitgeschakeld={geweest}
              href={programmaLink(activiteit, zichtbaarAlsLid.has(activiteit.id))}
            >
              <span className={stijl.rijInhoud}>
                <Datumblok {...dag} vandaag={activiteit.datum === vandaag} />
                <span className={stijl.kolom}>
                  <span className={stijl.tekst}>
                    <strong className={stijl.naam}>{activiteit.naam}</strong>
                    {regel && <span className={stijl.regel}>{regel}</span>}
                  </span>
                  {activiteit.status !== 'gepubliceerd' && (
                    <span className={stijl.label}>
                      <Rijstatus status={activiteit.status} />
                    </span>
                  )}
                </span>
              </span>
            </Lijstrij>
          );
        })}
      </Lijst>
    </Kaart>
  );
}

export default async function Programma() {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const supabase = await maakSupabase();

  // Het seizoen van vandaag komt uit de database (één grens, 1 september), niet uit de eerste rij.
  const { data: seizoen, error: seizoenFout } = await supabase.rpc('huidig_seizoen');
  if (seizoenFout) throw new Error(`seizoen niet te lezen: ${seizoenFout.code ?? seizoenFout.message}`);

  const { data, error } = await supabase
    .from('activiteiten')
    .select(KOLOMMEN)
    .eq('seizoen', seizoen)
    .order('datum', { ascending: true })
    .order('starttijd', { ascending: true, nullsFirst: false });
  if (error) throw new Error(`programma niet te lezen: ${error.code ?? error.message}`);

  // Wat dit lid als lid ziet (R15, R22). Een beheerder leest hierboven meer; een rij die hij als lid niet ziet, opent in beheer.
  const { data: zichtbaar, error: zichtbaarFout } = await supabase
    .from('mijn_activiteiten')
    .select('id')
    .eq('seizoen', seizoen);
  if (zichtbaarFout)
    throw new Error(`programma niet te lezen: ${zichtbaarFout.code ?? zichtbaarFout.message}`);
  const zichtbaarAlsLid = new Set(zichtbaar.flatMap((rij) => (rij.id ? [rij.id] : [])));

  const activiteiten: ProgrammaActiviteit[] = data.flatMap((rij) =>
    isActiviteitStatus(rij.status)
      ? [
          {
            id: rij.id,
            naam: rij.naam,
            datum: rij.datum,
            starttijd: rij.starttijd,
            locatie: rij.locatie,
            status: rij.status,
            eindigtOm: rij.eindigt_om,
          },
        ]
      : [],
  );
  const nu = new Date();
  const vandaag = vandaagInNederland(nu);
  const programma = maakProgramma(activiteiten, nu);
  // De tegel "Mijn diensten" van de wisselaar: hoeveel diensten er komen (UC-007).
  const aantalDiensten = splitsDiensten(await leesDiensten(supabase, seizoen), nu).komend.length;
  const titel = seizoenTitel(seizoen);

  return (
    <Schermkader actief="programma" titel={titel}>
      {activiteiten.length === 0 ? (
        <p>Er zijn nog geen activiteiten.</p>
      ) : (
        <>
          <Programmawisselaar
            aantalActiviteiten={programma.aantalKomende}
            aantalDiensten={aantalDiensten}
            actief="alles"
          />
          {programma.komende.map((maand) => (
            <Maandkaart
              key={maand.sleutel}
              maand={maand}
              vandaag={vandaag}
              geweest={false}
              kop="h2"
              zichtbaarAlsLid={zichtbaarAlsLid}
            />
          ))}
          {programma.geweest.length > 0 && (
            <>
              <h2 className={stijl.geweest}>Geweest dit seizoen</h2>
              {programma.geweest.map((maand) => (
                <Maandkaart
                  key={maand.sleutel}
                  maand={maand}
                  vandaag={vandaag}
                  geweest
                  kop="h3"
                  zichtbaarAlsLid={zichtbaarAlsLid}
                />
              ))}
            </>
          )}
        </>
      )}
    </Schermkader>
  );
}
