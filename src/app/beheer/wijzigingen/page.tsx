import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';
import {
  doelHref,
  groepeerPerDag,
  leesSoort,
  leesWijzigingen,
  PER_PAGINA,
  SOORT_LABEL,
  SOORTEN,
  uurTekst,
  vertaalLogfout,
  wijzigingenHref,
} from '@/lib/wijzigingenlog';

import stijl from './wijzigingen.module.css';

export const metadata: Metadata = { title: 'Wijzigingen – Ledenplatform' };

/**
 * Het wijzigingenlog (wireframe admin-wijzigingen, UC-015): per dag wie wat deed, van nieuw naar oud, met een filter in de zijkolom en "Toon oudere
 * wijzigingen" om verder terug te gaan. Alleen-lezen. Wat erin staat en wie het mag lezen, bepaalt de database (wijzigingen_lezen).
 */
export default async function Wijzigingen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await eisBeheer();
  const parameters = await searchParams;
  const soort = leesSoort(parameters.soort);
  const voor = z.coerce.number().int().min(1).safeParse(parameters.voor);

  const { data, error } = await (
    await maakSupabase()
  ).rpc('wijzigingen_lezen', {
    p_soort: soort,
    p_voor_id: voor.success ? voor.data : undefined,
    p_aantal: PER_PAGINA,
  });
  if (error) {
    console.error(`wijzigingenlog niet te lezen: ${error.code ?? error.message}`);
    if (error.code === 'BK001' && error.message === 'geen_admin') redirect('/beheer');
    throw new Error(vertaalLogfout(error.message));
  }
  const alle = leesWijzigingen(data);
  const meer = alle.length > PER_PAGINA;
  const regels = alle.slice(0, PER_PAGINA);
  const dagen = groepeerPerDag(regels, new Date());
  const laatste = regels[regels.length - 1];

  return (
    <Schermkader
      actief="beheer"
      titel="Wijzigingen"
      terug={{ href: '/beheer', tekst: 'Terug naar activiteiten' }}
      zijkolom={
        <>
          <Kaart titel="Tonen" label lijst>
            <Lijst>
              {SOORTEN.map((s) => (
                <Lijstrij key={s} href={wijzigingenHref(s)} gemarkeerd={s === soort}>
                  <span className={stijl.filter}>
                    <span aria-hidden="true">{s === soort ? '●' : '○'}</span>
                    {s === soort ? <strong>{SOORT_LABEL[s]}</strong> : SOORT_LABEL[s]}
                  </span>
                </Lijstrij>
              ))}
            </Lijst>
          </Kaart>
          <Kaart>
            <p className={stijl.hulp}>
              Wie wat wanneer heeft gewijzigd, van nieuw naar oud. Alleen beheerders zien dit. Afmeldingen
              staan er niet in, ook niet de reden.
            </p>
          </Kaart>
        </>
      }
    >
      {dagen.length === 0 && (
        <Kaart>
          <p className={stijl.hulp}>
            {soort === 'alles'
              ? 'Er zijn nog geen wijzigingen.'
              : `Er zijn geen wijzigingen bij ${SOORT_LABEL[soort].toLowerCase()}.`}
          </p>
        </Kaart>
      )}
      {dagen.map((dag) => (
        <Kaart key={dag.sleutel} titel={dag.kop} label lijst>
          <Lijst>
            {dag.regels.map((w) => (
              <Lijstrij key={w.id} href={doelHref(w) ?? undefined}>
                <span className={stijl.regel}>
                  <span className={stijl.tekst}>
                    <strong className={stijl.wie}>{w.door}</strong>
                    <span className={stijl.wat}>{w.omschrijving}</span>
                  </span>
                  <span className={stijl.uur}>{uurTekst(w.moment)}</span>
                </span>
              </Lijstrij>
            ))}
          </Lijst>
        </Kaart>
      ))}
      {meer && laatste && (
        <div>
          <Knop href={wijzigingenHref(soort, laatste.id)} soort="tekst">
            Toon oudere wijzigingen
          </Knop>
        </div>
      )}
    </Schermkader>
  );
}
