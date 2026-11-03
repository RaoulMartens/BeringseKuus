import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Datumblok } from '@/components/datumblok/datumblok';
import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Statuslabel } from '@/components/statuslabel/statuslabel';
import {
  dagTekst,
  isActiviteitStatus,
  maakProgramma,
  regelOnderNaam,
  vandaagInNederland,
  type Maand,
  type ProgrammaActiviteit,
} from '@/lib/programma';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { seizoenTitel } from '@/lib/vereniging';
import { maakSupabase } from '@/lib/supabase/server';

import stijl from './programma.module.css';

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
}: {
  maand: Maand;
  vandaag: string;
  geweest: boolean;
  kop: 'h2' | 'h3';
}) {
  return (
    <Kaart titel={maand.titel} kop={kop} lijst>
      <Lijst>
        {maand.activiteiten.map((activiteit) => {
          const dag = dagTekst(activiteit.datum);
          const regel = regelOnderNaam(activiteit);
          return (
            <Lijstrij key={activiteit.id} uitgeschakeld={geweest}>
              <Datumblok {...dag} vandaag={activiteit.datum === vandaag} />
              <span className={stijl.tekst}>
                <strong className={stijl.naam}>{activiteit.naam}</strong>
                {regel && <span className={stijl.regel}>{regel}</span>}
              </span>
              {activiteit.status === 'concept' && <Statuslabel status="concept">Concept</Statuslabel>}
              {activiteit.status === 'geannuleerd' && (
                <Statuslabel status="geannuleerd">Geannuleerd</Statuslabel>
              )}
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
  const titel = seizoenTitel(seizoen);

  return (
    <Schermkader actief="programma" titel={titel}>
      {activiteiten.length === 0 ? (
        <p>Er zijn nog geen activiteiten.</p>
      ) : (
        <>
          <p className={stijl.telling}>
            {programma.aantalKomende} komende {programma.aantalKomende === 1 ? 'activiteit' : 'activiteiten'}
          </p>
          {programma.komende.map((maand) => (
            <Maandkaart key={maand.sleutel} maand={maand} vandaag={vandaag} geweest={false} kop="h2" />
          ))}
          {programma.geweest.length > 0 && (
            <>
              <h2 className={stijl.geweest}>Geweest dit seizoen</h2>
              {programma.geweest.map((maand) => (
                <Maandkaart key={maand.sleutel} maand={maand} vandaag={vandaag} geweest kop="h3" />
              ))}
            </>
          )}
        </>
      )}
    </Schermkader>
  );
}
