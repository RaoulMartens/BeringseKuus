'use client';

// Vorig seizoen kopiëren (UC-006, wireframes admin-bulk-kopieren en admin-bulk-controleren). Twee stappen in één onderdeel:
//  1. het seizoen kiezen, de activiteit met een bekende datum (bijvoorbeeld de Optocht) en de datum waarop die in het nieuwe
//     seizoen valt; alles schuift evenveel mee, behalve 11 november;
//  2. de activiteiten nalopen: de datum per regel is aan te passen, "Niet meenemen" laat een regel weg.
// Er is nog niets opgeslagen tot "N concepten aanmaken": weggaan kost niets (UC-006 AF-4). De database controleert elke regel
// opnieuw en maakt ze in één transactie aan (activiteiten_bulk_aanmaken), met dezelfde actie als de Excel-import.

import { useActionState, useState } from 'react';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Veld } from '@/components/veld/veld';
import {
  controleerKopie,
  kopieSamenvatting,
  leesInvoerDatum,
  maakKopie,
  naarKopieServerregels,
  seizoenVan,
  type KopieRegel,
} from '@/lib/kopieren';
import { dagTekst } from '@/lib/programma';

import { maakConcepten, type ConceptenStaat } from './acties';
import bulk from './bulk.module.css';
import type { Seizoen } from './gegevens';

const START: ConceptenStaat = { melding: null };

interface Groepnaam {
  id: string;
  naam: string;
}

/** De activiteit die het meest voor de hand ligt als activiteit met een bekende datum: de Optocht, anders de eerste. */
function standaardReferentie(seizoen: Seizoen): string {
  const optocht = seizoen.activiteiten.find((activiteit) => /optocht/i.test(activiteit.naam));
  return (optocht ?? seizoen.activiteiten[0])?.id ?? '';
}

export function Kopieren({ seizoenen, groepen }: { seizoenen: Seizoen[]; groepen: Groepnaam[] }) {
  const [seizoenIndex, setSeizoenIndex] = useState(0);
  const seizoen = seizoenen[seizoenIndex];
  const [referentieId, setReferentieId] = useState(() =>
    seizoenen[0] ? standaardReferentie(seizoenen[0]) : '',
  );
  const [nieuweDatum, setNieuweDatum] = useState('');
  const [startFout, setStartFout] = useState<string | null>(null);
  const [regels, setRegels] = useState<KopieRegel[] | null>(null);
  // De datum waarmee een regel begon, om een aangepaste datum te markeren (de stip voor "nog niet opgeslagen").
  const [begin, setBegin] = useState<Record<number, string>>({});
  const [aanmaakId, setAanmaakId] = useState('');
  const [staat, voerUit] = useActionState<ConceptenStaat, FormData>(maakConcepten, START);

  if (!seizoen) {
    return <p className={bulk.leeg}>Er zijn nog geen activiteiten om te kopiëren.</p>;
  }
  const nieuwSeizoenGok = seizoen.beginjaar + 1;
  const groepNaam = new Map(groepen.map((groep) => [groep.id, groep.naam]));

  function kiesSeizoen(waarde: string) {
    const index = Number(waarde);
    const gekozen = seizoenen[index];
    if (!gekozen) return;
    setSeizoenIndex(index);
    setReferentieId(standaardReferentie(gekozen));
    setStartFout(null);
  }

  function controleren() {
    if (!seizoen) return;
    const iso = leesInvoerDatum(nieuweDatum, nieuwSeizoenGok);
    if (iso === null) {
      setStartFout(
        'Vul de datum in waarop deze activiteit in het nieuwe seizoen valt, bijvoorbeeld 27-02-2028.',
      );
      return;
    }
    if (seizoenVan(iso) <= seizoen.beginjaar) {
      setStartFout('Kies een datum in een later seizoen dan het seizoen dat je kopieert.');
      return;
    }
    const uit = maakKopie(seizoen.activiteiten, referentieId, iso);
    if (uit.length === 0) {
      setStartFout('Kies een activiteit met een bekende datum.');
      return;
    }
    setStartFout(null);
    setBegin(Object.fromEntries(uit.map((regel) => [regel.nr, regel.datum])));
    setRegels(uit);
    setAanmaakId(crypto.randomUUID());
  }

  function terug() {
    setRegels(null);
  }

  function wijzig(nr: number, wijziging: Partial<KopieRegel>) {
    setRegels((huidig) =>
      huidig ? huidig.map((regel) => (regel.nr === nr ? { ...regel, ...wijziging } : regel)) : huidig,
    );
  }

  if (regels === null) {
    const referentie = seizoen.activiteiten.find((activiteit) => activiteit.id === referentieId);
    return (
      <form
        className={bulk.stap}
        noValidate
        onSubmit={(gebeurtenis) => {
          gebeurtenis.preventDefault();
          controleren();
        }}
      >
        <Kaart
          titel="Welk seizoen kopieer je?"
          ondertitel="Alle activiteiten van dat seizoen komen als concept in het nieuwe seizoen. Wie waar is ingedeeld gaat niet mee."
        >
          <div className={bulk.selectveld}>
            <label htmlFor="kopie-seizoen" className={bulk.label}>
              Seizoen
            </label>
            <select
              id="kopie-seizoen"
              className={bulk.select}
              value={seizoenIndex}
              onChange={(e) => kiesSeizoen(e.target.value)}
            >
              {seizoenen.map((optie, index) => (
                <option key={optie.beginjaar} value={index}>
                  {optie.naam} ·{' '}
                  {optie.activiteiten.length === 1
                    ? '1 activiteit'
                    : `${optie.activiteiten.length} activiteiten`}
                </option>
              ))}
            </select>
          </div>
        </Kaart>
        <Kaart
          titel="Wanneer valt dit seizoen?"
          ondertitel="Kies een activiteit waarvan je de datum al weet. Alles schuift evenveel mee, behalve 11 november."
        >
          <div className={bulk.selectveld}>
            <label htmlFor="kopie-referentie" className={bulk.label}>
              Activiteit met bekende datum
            </label>
            <select
              id="kopie-referentie"
              className={bulk.select}
              value={referentieId}
              onChange={(e) => setReferentieId(e.target.value)}
            >
              {seizoen.activiteiten.map((activiteit) => (
                <option key={activiteit.id} value={activiteit.id}>
                  {activiteit.naam}, {dagTekst(activiteit.datum).lang} {activiteit.datum.slice(0, 4)}
                </option>
              ))}
            </select>
          </div>
          <Veld
            id="kopie-datum"
            label={referentie ? `${referentie.naam} valt dit seizoen op` : 'Valt dit seizoen op'}
            hulp="Bijvoorbeeld 27-02-2028"
            fout={startFout ?? undefined}
            value={nieuweDatum}
            onChange={(e) => setNieuweDatum(e.target.value)}
            autoComplete="off"
            inputMode="numeric"
          />
        </Kaart>
        <div>
          <Knop type="submit" soort="positief">
            Controleren
          </Knop>
        </div>
      </form>
    );
  }

  const { aantal, metFouten } = kopieSamenvatting(regels, nieuwSeizoenGok);
  const server = naarKopieServerregels(regels, nieuwSeizoenGok);

  return (
    <form action={voerUit} className={bulk.stap} noValidate>
      <input type="hidden" name="aanmaak_id" value={aanmaakId} />
      <input type="hidden" name="regels" value={JSON.stringify(server.regels)} />
      <input type="hidden" name="nummers" value={JSON.stringify(server.nummers)} />

      <p className={bulk.bestandsnaam}>
        <strong>{seizoen.naam} gekopieerd</strong>
        <Knop soort="tekst" onClick={terug}>
          Andere datum kiezen
        </Knop>
      </p>

      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      {metFouten > 0 && (
        <Melding soort="let-op">
          <strong>{metFouten === 1 ? '1 regel klopt niet' : `${metFouten} regels kloppen niet`}.</strong> Pas{' '}
          {metFouten === 1 ? 'hem' : 'ze'} aan of kies “Niet meenemen”.
        </Melding>
      )}

      <Kaart titel="Controleer de activiteiten" lijst>
        <Lijst>
          {regels.map((regel) => {
            const fouten = controleerKopie(regel, nieuwSeizoenGok);
            const iso = leesInvoerDatum(regel.datum, nieuwSeizoenGok);
            const tijd = (regel.bron.verzameltijd ?? regel.bron.starttijd)?.slice(0, 5);
            const voorWie = regel.bron.groepen.flatMap((id) => groepNaam.get(id) ?? []).join(', ');
            const meta = [regel.bron.locatie, voorWie].filter(Boolean).join(' · ');
            const onderdelen = [
              `Vorig seizoen: ${dagTekst(regel.oudeDatum).lang} ${regel.oudeDatum.slice(0, 4)}`,
              regel.vast ? 'Vaste datum: elk jaar 11 november' : null,
            ].filter(Boolean);
            return (
              <Lijstrij key={regel.nr}>
                <div className={bulk.regel}>
                  <div className={bulk.kop}>
                    <span
                      className={[bulk.tekst, regel.meenemen ? undefined : bulk.weg]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className={bulk.dag}>{iso ? dagTekst(iso).lang : 'Datum ontbreekt'}</span>
                      <strong className={bulk.naam}>
                        {regel.bron.naam}
                        {tijd && <span className={bulk.tijd}> — {tijd}</span>}
                      </strong>
                      {meta && <span className={bulk.meta}>{meta}</span>}
                    </span>
                    <Knop soort="tekst" onClick={() => wijzig(regel.nr, { meenemen: !regel.meenemen })}>
                      {regel.meenemen ? 'Niet meenemen' : 'Toch meenemen'}
                    </Knop>
                  </div>
                  {regel.meenemen && (
                    <>
                      <div className={bulk.velden}>
                        <Veld
                          id={`kopie-${regel.nr}-datum`}
                          label="Datum"
                          fout={fouten.datum}
                          gewijzigd={regel.datum !== begin[regel.nr]}
                          value={regel.datum}
                          onChange={(e) => wijzig(regel.nr, { datum: e.target.value })}
                          autoComplete="off"
                          inputMode="numeric"
                        />
                      </div>
                      {fouten.starttijd && <p className={bulk.regelfout}>{fouten.starttijd}</p>}
                      {fouten.locatie && <p className={bulk.regelfout}>{fouten.locatie}</p>}
                    </>
                  )}
                  <p className={bulk.vorig}>{onderdelen.join(' · ')}</p>
                </div>
              </Lijstrij>
            );
          })}
        </Lijst>
      </Kaart>

      <div className={bulk.voet}>
        <p className={bulk.aantal}>
          <strong>{aantal === 1 ? '1 concept' : `${aantal} concepten`}</strong>
          <span>Leden zien ze pas als je publiceert.</span>
        </p>
        <Knop type="submit" disabled={metFouten > 0 || aantal === 0}>
          {aantal === 1 ? '1 concept aanmaken' : `${aantal} concepten aanmaken`}
        </Knop>
      </div>
    </form>
  );
}
