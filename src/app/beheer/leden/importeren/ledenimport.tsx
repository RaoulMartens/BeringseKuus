'use client';

// Meerdere leden tegelijk toevoegen met een Excel-bestand (UC-013 AF-7, wireframes admin-leden-importeren en admin-leden-importeren-controle). Twee stappen in
// één onderdeel, omdat het bestand in de browser blijft:
//  1. het sjabloon downloaden en het ingevulde bestand kiezen; het bestand wordt hier gelezen (src/lib/xlsx.ts), de server krijgt alleen de regels;
//  2. de controle (de proef van de database): eerst wat niet kan, dan wat al bestaat, dan wat erbij komt. Een fout verbeter je in het bestand; je kiest het
//     opnieuw. "N leden toevoegen en uitnodigen" is uit zolang er een fout is: alles of niets.
// Er is niets opgeslagen tot die knop: weggaan kost niets.

import { useActionState, useState, useTransition, type ChangeEvent } from 'react';

import type { Groep } from '@/lib/activiteitenimport';
import { Icoon } from '@/components/icoon/icoon';
import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import {
  controleNaam,
  isLedenLeesFout,
  leesLedenRegels,
  naarLedenServerregels,
  onbekendeGroepen,
  regelFoutTekst,
  vertaalLedenLeesfout,
  type ControleRegel,
  type LedenLeesFout,
  type LedenServerregel,
} from '@/lib/ledenimport';
import { leesXlsx, MAX_BESTAND, XlsxFout } from '@/lib/xlsx';

import stijl from '../leden.module.css';
import { controleerLeden, voegLedenToe, type ToevoegStaat } from './acties';

const START: ToevoegStaat = { melding: null };
/** Zoveel nieuwe leden tonen we bij naam; de rest telt mee in "En N andere". */
const TOON = 5;

interface Weergave extends ControleRegel {
  tekst?: string;
}

export function Ledenimport({ groepen }: { groepen: Groep[] }) {
  const [leesFout, setLeesFout] = useState<string | null>(null);
  const [bestandsnaam, setBestandsnaam] = useState('');
  const [server, setServer] = useState<LedenServerregel[] | null>(null);
  const [regels, setRegels] = useState<Weergave[] | null>(null);
  const [voorbeelden, setVoorbeelden] = useState(0);
  const [bezig, start] = useTransition();
  const [staat, voerUit] = useActionState<ToevoegStaat, FormData>(voegLedenToe, START);

  async function kiesBestand(gebeurtenis: ChangeEvent<HTMLInputElement>) {
    const bestand = gebeurtenis.target.files?.[0];
    if (!bestand) return;
    setLeesFout(null);
    const fout = (code: LedenLeesFout['code']) => setLeesFout(vertaalLedenLeesfout({ code }));
    if (/\.xlsm$/i.test(bestand.name)) return fout('macro');
    if (!/\.xlsx$/i.test(bestand.name)) return fout('geen_xlsx');
    if (bestand.size > MAX_BESTAND) return fout('te_groot');
    try {
      const rijen = await leesXlsx(new Uint8Array(await bestand.arrayBuffer()));
      const uitkomst = leesLedenRegels(rijen);
      if (isLedenLeesFout(uitkomst)) return setLeesFout(vertaalLedenLeesfout(uitkomst));
      const naarServer = naarLedenServerregels(uitkomst.regels, groepen);
      const onbekend = onbekendeGroepen(uitkomst.regels, groepen);
      start(async () => {
        const antwoord = await controleerLeden(naarServer);
        if (!antwoord.controle) return setLeesFout(antwoord.melding);
        setServer(naarServer);
        setBestandsnaam(bestand.name);
        setVoorbeelden(uitkomst.voorbeelden.length);
        // Een groep die niet bestaat is een fout, ook als de regel nog een goede groep heeft: de database kent alleen de goede.
        setRegels(
          antwoord.controle.regels.map((r) => {
            const slecht = onbekend.get(r.regel);
            if (slecht) return { ...r, status: 'fout', tekst: regelFoutTekst(undefined, slecht) };
            return r.status === 'fout' ? { ...r, tekst: regelFoutTekst(r.code) } : r;
          }),
        );
      });
    } catch (e) {
      fout(e instanceof XlsxFout ? e.code : 'beschadigd');
    }
  }

  function terug() {
    setServer(null);
    setRegels(null);
    setLeesFout(null);
  }

  if (regels === null || server === null) {
    return (
      <div className={stijl.formulier}>
        <Kaart
          titel="1. Vul het sjabloon in"
          ondertitel="Een regel per lid: voornaam, achternaam, e-mailadres, groepen (gescheiden door een puntkomma) en eventueel een telefoonnummer. Wis de voorbeeldregels."
        >
          <a href="/lid-sjabloon.xlsx" download className={stijl.download}>
            <Icoon naam="download" />
            Sjabloon downloaden (lid-sjabloon.xlsx)
          </a>
        </Kaart>
        <Kaart
          titel="2. Kies je bestand"
          ondertitel="Alleen .xlsx, hooguit 1 MB en 200 leden. Het bestand blijft op je computer: alleen de regels gaan naar het platform. Je ziet eerst wat er zou gebeuren; er gaat nog niets naar de leden."
        >
          <label className={stijl.bestandsveld}>
            <span className={stijl.bestandslabel}>
              {bezig ? 'Bezig met controleren…' : 'Kies je Excel-bestand'}
            </span>
            <input
              type="file"
              accept=".xlsx"
              className={stijl.bestand}
              onChange={kiesBestand}
              disabled={bezig}
            />
          </label>
          {leesFout && (
            <Melding soort="fout" rol="alert">
              {leesFout}
            </Melding>
          )}
        </Kaart>
      </div>
    );
  }

  const fouten = regels.filter((r) => r.status === 'fout');
  const bestaat = regels.filter((r) => r.status === 'bestaat_al');
  const nieuw = regels.filter((r) => r.status === 'toevoegen');
  const aantal = nieuw.length;
  const toevoegen = (aantal === 1 ? '1 lid' : `${aantal} leden`) + ' toevoegen en uitnodigen';

  return (
    <form action={voerUit} className={stijl.formulier}>
      <input type="hidden" name="regels" value={JSON.stringify(server)} />
      <p className={stijl.bestandsnaam}>
        <strong>{bestandsnaam}</strong>
        <Knop soort="tekst" onClick={terug}>
          Ander bestand kiezen
        </Knop>
      </p>
      {voorbeelden > 0 && (
        <Melding soort="info">
          {voorbeelden === 1
            ? '1 voorbeeldregel is overgeslagen.'
            : `${voorbeelden} voorbeeldregels zijn overgeslagen.`}
        </Melding>
      )}
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      <Melding soort={fouten.length > 0 ? 'let-op' : 'info'}>
        {regels.length} regels gelezen:{' '}
        <strong>{aantal === 1 ? '1 kan' : `${aantal} kunnen`} worden toegevoegd</strong>
        {bestaat.length > 0 && `, ${bestaat.length} bestaat al`}
        {fouten.length > 0 &&
          ` en ${fouten.length === 1 ? '1 heeft een fout' : `${fouten.length} hebben een fout`}`}
        .
      </Melding>

      {fouten.length > 0 && (
        <Kaart titel={`Regels met een fout (${fouten.length})`} label lijst>
          <Lijst>
            {fouten.map((r) => (
              <Lijstrij key={r.regel}>
                <span className={stijl.tekst}>
                  <strong className={stijl.naam}>
                    Regel {r.regel}: {controleNaam(r)}
                  </strong>
                  <span className={stijl.onder}>
                    {r.tekst} Verbeter het in het bestand en kies het opnieuw.
                  </span>
                </span>
              </Lijstrij>
            ))}
          </Lijst>
        </Kaart>
      )}
      {bestaat.length > 0 && (
        <Kaart titel={`Bestaat al (${bestaat.length})`} label lijst>
          <Lijst>
            {bestaat.map((r) => (
              <Lijstrij key={r.regel}>
                <span className={stijl.tekst}>
                  <strong className={stijl.naam}>
                    Regel {r.regel}: {controleNaam(r)}
                  </strong>
                  <span className={stijl.onder}>{r.email} is al lid. Deze regel wordt overgeslagen.</span>
                </span>
              </Lijstrij>
            ))}
          </Lijst>
        </Kaart>
      )}
      {aantal > 0 && (
        <Kaart titel={`Worden toegevoegd (${aantal})`} label lijst>
          <Lijst>
            {nieuw.slice(0, TOON).map((r) => (
              <Lijstrij key={r.regel}>
                <span className={stijl.tekst}>
                  <strong className={stijl.naam}>{controleNaam(r)}</strong>
                  <span className={stijl.onder}>{r.email}</span>
                </span>
              </Lijstrij>
            ))}
          </Lijst>
          {aantal > TOON && <p className={stijl.hulp}>En {aantal - TOON} andere.</p>}
        </Kaart>
      )}

      <Melding soort="let-op">
        {fouten.length > 0
          ? 'Zolang er een regel met een fout is, kun je niemand toevoegen.'
          : `Dit stuurt ${aantal === 1 ? '1 uitnodiging' : `${aantal} uitnodigingen`} per mail.`}
      </Melding>
      <div className={stijl.knoppen}>
        <Knop type="submit" soort="positief" disabled={fouten.length > 0 || aantal === 0}>
          {toevoegen}
        </Knop>
        <Knop soort="tekst" onClick={terug}>
          Ander bestand kiezen
        </Knop>
      </div>
    </form>
  );
}
