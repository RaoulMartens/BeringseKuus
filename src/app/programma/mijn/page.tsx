import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Datumblok } from '@/components/datumblok/datumblok';
import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Statuslabel } from '@/components/statuslabel/statuslabel';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { rolLabel } from '@/lib/ledenactiviteit';
import { rolTekst, sorteerAfgemeld, splitsDiensten } from '@/lib/mijndiensten';
import { dagTekst, regelOnderNaam, vandaagInNederland } from '@/lib/programma';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { seizoenTitel } from '@/lib/vereniging';
import { maakSupabase } from '@/lib/supabase/server';

import { leesAantalKomende } from '../aantallen';
import { Programmawisselaar } from '../wisselaar';
import stijl from '../programma.module.css';

import { leesAfmeldingen, leesDiensten } from './gegevens';

export const metadata: Metadata = { title: 'Mijn diensten – Ledenplatform' };

/**
 * Mijn diensten (UC-007, V8 5.7): de plekken waar je zelf op staat, op datum, met wat er komt, waarvoor je bent afgemeld en wat al
 * geweest is. Alleen plekken, niet "aanwezig zonder dienst": iedereen staat standaard op aanwezig (R1), en dat zou het overzicht gelijk
 * maken aan het programma. Welke activiteiten een lid mag zien, beslist de database (R13, R15, R22); de bak hoort er nog niet bij.
 * Een regel opent de activiteit, waar je de afmelding kunt intrekken (R9).
 */
export default async function MijnDiensten() {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/mijn');
  const supabase = await maakSupabase();

  const { data: seizoen, error } = await supabase.rpc('huidig_seizoen');
  if (error) throw new Error(`seizoen niet te lezen: ${error.code ?? error.message}`);

  const nu = new Date();
  const vandaag = vandaagInNederland(nu);
  const [rijen, afgemeld, komendeActiviteiten] = await Promise.all([
    leesDiensten(supabase, seizoen),
    leesAfmeldingen(supabase, gebruiker.lidId, nu, seizoen),
    leesAantalKomende(supabase, seizoen, nu),
  ]);
  const diensten = splitsDiensten(rijen, nu);
  const afmeldingen = sorteerAfgemeld(afgemeld);
  const regel = (a: { starttijd: string | null; locatie: string | null }) => regelOnderNaam(a);

  return (
    <Schermkader actief="programma" titel={seizoenTitel(seizoen)}>
      <Programmawisselaar
        aantalActiviteiten={komendeActiviteiten}
        aantalDiensten={diensten.komend.length}
        actief="mijn"
      />

      {diensten.komend.length === 0 ? (
        <Kaart titel="Komende diensten">
          <p className={stijl.leeg}>Je staat nog nergens als dienst ingedeeld.</p>
        </Kaart>
      ) : (
        <Kaart titel="Komende diensten" lijst>
          <Lijst>
            {diensten.komend.map((dienst) => (
              <Lijstrij key={dienst.activiteitId} href={`/programma/${dienst.activiteitId}`}>
                <Datumblok {...dagTekst(dienst.datum)} vandaag={dienst.datum === vandaag} />
                <span className={stijl.tekst}>
                  <strong className={stijl.naam}>{dienst.naam}</strong>
                  <span className={stijl.regel}>{regel(dienst)}</span>
                </span>
                <Statuslabel>{rolTekst([dienst.rol], rolLabel)}</Statuslabel>
              </Lijstrij>
            ))}
          </Lijst>
        </Kaart>
      )}

      {afmeldingen.length > 0 && (
        <Kaart titel="Afgemeld" lijst>
          <Lijst>
            {afmeldingen.map((activiteit) => (
              <Lijstrij key={activiteit.activiteitId} href={`/programma/${activiteit.activiteitId}`}>
                <Datumblok {...dagTekst(activiteit.datum)} vandaag={activiteit.datum === vandaag} />
                <span className={stijl.tekst}>
                  <strong className={stijl.naam}>{activiteit.naam}</strong>
                  <span className={stijl.regel}>{regel(activiteit)}</span>
                </span>
                <Statuslabel>afgemeld</Statuslabel>
              </Lijstrij>
            ))}
          </Lijst>
        </Kaart>
      )}

      {diensten.geweest.length > 0 && (
        <>
          <h2 className={stijl.geweest}>Geweest dit seizoen</h2>
          <Kaart lijst>
            <Lijst zonderKop>
              {diensten.geweest.map((dienst) => (
                <Lijstrij key={dienst.activiteitId} href={`/programma/${dienst.activiteitId}`} uitgeschakeld>
                  <Datumblok {...dagTekst(dienst.datum)} />
                  <span className={stijl.tekst}>
                    <strong className={stijl.naam}>{dienst.naam}</strong>
                    <span className={stijl.regel}>{regel(dienst)}</span>
                  </span>
                  <Statuslabel>{rolTekst([dienst.rol], rolLabel)}</Statuslabel>
                </Lijstrij>
              ))}
            </Lijst>
          </Kaart>
        </>
      )}
    </Schermkader>
  );
}
