'use client';

// Meerdere activiteiten tegelijk aanmaken met een Excel-bestand (UC-006, wireframes admin-bulk-importeren en
// admin-bulk-controleren). Twee stappen in één onderdeel, omdat het bestand in de browser blijft:
//  1. het sjabloon downloaden en het ingevulde bestand kiezen; het bestand wordt hier gelezen (src/lib/xlsx.ts), de server krijgt
//     het nooit;
//  2. de regels nalopen: een regel met een fout toont wat er mist, met het veld op de regel zelf om in te vullen; "Niet meenemen"
//     laat een regel weg. "N concepten aanmaken" is uit tot alle fouten zijn opgelost of weggelaten.
// Er is nog niets opgeslagen tot de knop: weggaan kost niets (UC-006 AF-4). De database controleert elke regel opnieuw.

import { useActionState, useState, type ChangeEvent } from 'react';

import { Icoon } from '@/components/icoon/icoon';
import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Veld } from '@/components/veld/veld';
import {
  controleerRegel,
  isImportFout,
  leesDatum,
  leesRegels,
  leesTijd,
  naarServerregels,
  samenvatting,
  vertaalImportfout,
  type Groep,
  type ImportFout,
  type ImportRegel,
  type RegelVeld,
} from '@/lib/activiteitenimport';
import { dagTekst } from '@/lib/programma';
import { leesXlsx, MAX_BESTAND, XlsxFout } from '@/lib/xlsx';

import { maakConcepten, type ConceptenStaat } from './acties';
import stijl from './bulk.module.css';

const START: ConceptenStaat = { melding: null };

const VELD: Record<RegelVeld, { label: string; hulp?: string }> = {
  naam: { label: 'Naam' },
  datum: { label: 'Datum', hulp: 'Bijvoorbeeld 11-02-2028' },
  verzameltijd: { label: 'Verzameltijd', hulp: 'Bijvoorbeeld 18:30' },
  starttijd: { label: 'Starttijd', hulp: 'Bijvoorbeeld 19:00' },
  eindtijd: { label: 'Eindtijd', hulp: 'Bijvoorbeeld 23:00' },
  locatie: { label: 'Locatie' },
  busvertrek: { label: 'Busvertrek', hulp: 'Bijvoorbeeld 17:00' },
  notitie: { label: 'Belangrijk om te weten' },
  voorWie: { label: 'Voor wie', hulp: 'Groepen gescheiden door een puntkomma' },
};

export function Importeren({ groepen, seizoen }: { groepen: Groep[]; seizoen: number }) {
  const [regels, setRegels] = useState<ImportRegel[] | null>(null);
  const [voorbeelden, setVoorbeelden] = useState<number[]>([]);
  const [leesFout, setLeesFout] = useState<string | null>(null);
  const [bestandsnaam, setBestandsnaam] = useState('');
  const [aanmaakId, setAanmaakId] = useState('');
  // De velden die de beheerder aan het invullen is, blijven staan ook als ze intussen kloppen: anders verdwijnt het veld
  // onder zijn handen bij de eerste goede letter.
  const [getoond, setGetoond] = useState<Record<number, RegelVeld[]>>({});
  const [staat, voerUit] = useActionState<ConceptenStaat, FormData>(maakConcepten, START);

  async function kiesBestand(gebeurtenis: ChangeEvent<HTMLInputElement>) {
    const bestand = gebeurtenis.target.files?.[0];
    if (!bestand) return;
    setLeesFout(null);
    const fout = (code: ImportFout['code']) => setLeesFout(vertaalImportfout({ code }));
    if (/\.xlsm$/i.test(bestand.name)) return fout('macro');
    if (!/\.xlsx$/i.test(bestand.name)) return fout('geen_xlsx');
    if (bestand.size > MAX_BESTAND) return fout('te_groot');
    try {
      const rijen = await leesXlsx(new Uint8Array(await bestand.arrayBuffer()));
      const uitkomst = leesRegels(rijen, seizoen);
      if (isImportFout(uitkomst)) return setLeesFout(vertaalImportfout(uitkomst));
      setRegels(uitkomst.regels);
      setVoorbeelden(uitkomst.voorbeelden);
      setBestandsnaam(bestand.name);
      setAanmaakId(crypto.randomUUID());
      setGetoond({});
    } catch (e) {
      fout(e instanceof XlsxFout ? e.code : 'beschadigd');
    }
  }

  function terug() {
    setRegels(null);
    setVoorbeelden([]);
    setGetoond({});
    setLeesFout(null);
  }

  function wijzig(index: number, wijziging: Partial<ImportRegel>, veld?: RegelVeld) {
    if (!regels) return;
    const regel = regels[index];
    if (!regel) return;
    // Onthoud welke velden nu een fout hebben (en het veld dat wordt aangepast), zodat ze blijven staan.
    const nu = Object.keys(controleerRegel(regel, groepen)) as RegelVeld[];
    setGetoond((g) => ({
      ...g,
      [regel.nr]: [...new Set([...(g[regel.nr] ?? []), ...nu, ...(veld ? [veld] : [])])],
    }));
    setRegels(regels.map((r, i) => (i === index ? { ...r, ...wijziging } : r)));
  }

  if (regels === null) {
    return (
      <div className={stijl.stap}>
        <Kaart titel="Sjabloon" ondertitel="Vul per activiteit een regel in en wis de voorbeeldregels.">
          <a href="/activiteiten-sjabloon.xlsx" download className={stijl.download}>
            <Icoon naam="download" />
            Sjabloon downloaden (activiteiten-sjabloon.xlsx)
          </a>
        </Kaart>
        <Kaart
          titel="Ingevuld bestand"
          ondertitel="Alleen .xlsx, hooguit 1 MB en 200 activiteiten. Het bestand blijft op je computer: alleen de regels gaan naar het platform."
        >
          <label className={stijl.bestandsveld}>
            <span className={stijl.bestandslabel}>Kies je Excel-bestand</span>
            <input type="file" accept=".xlsx" className={stijl.bestand} onChange={kiesBestand} />
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

  const { aantal, metFouten } = samenvatting(regels, groepen);
  const server = naarServerregels(regels, groepen);

  return (
    <form action={voerUit} className={stijl.stap} noValidate>
      <input type="hidden" name="aanmaak_id" value={aanmaakId} />
      <input type="hidden" name="regels" value={JSON.stringify(server.regels)} />
      <input type="hidden" name="nummers" value={JSON.stringify(server.nummers)} />

      <p className={stijl.bestandsnaam}>
        <strong>{bestandsnaam}</strong>
        <Knop soort="tekst" onClick={terug}>
          Ander bestand kiezen
        </Knop>
      </p>

      {voorbeelden.length > 0 && (
        <Melding soort="info">
          {voorbeelden.length === 1
            ? '1 voorbeeldregel is overgeslagen.'
            : `${voorbeelden.length} voorbeeldregels zijn overgeslagen.`}
        </Melding>
      )}
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      {metFouten > 0 && (
        <Melding soort="let-op">
          <strong>{metFouten === 1 ? '1 regel klopt niet' : `${metFouten} regels kloppen niet`}.</strong> Vul{' '}
          {metFouten === 1 ? 'hem' : 'ze'} in of kies “Niet meenemen”.
        </Melding>
      )}

      <Kaart titel="Controleer de activiteiten" lijst>
        <Lijst>
          {regels.map((regel, index) => {
            const fouten = controleerRegel(regel, groepen);
            const zichtbaar = new Set<RegelVeld>([
              ...(getoond[regel.nr] ?? []),
              ...(Object.keys(fouten) as RegelVeld[]),
            ]);
            const iso = leesDatum(regel.datum, seizoen);
            const tijd = leesTijd(regel.verzameltijd) ?? leesTijd(regel.starttijd);
            return (
              <Lijstrij key={regel.nr}>
                <div className={stijl.regel}>
                  <div className={stijl.kop}>
                    <span
                      className={[stijl.tekst, regel.meenemen ? undefined : stijl.weg]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className={stijl.dag}>{iso ? dagTekst(iso).lang : 'Datum ontbreekt'}</span>
                      <strong className={stijl.naam}>
                        {regel.naam || 'Naam ontbreekt'}
                        {tijd && <span className={stijl.tijd}> — {tijd}</span>}
                      </strong>
                      {(regel.locatie || regel.voorWie) && (
                        <span className={stijl.meta}>
                          {[regel.locatie, regel.voorWie].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <Knop soort="tekst" onClick={() => wijzig(index, { meenemen: !regel.meenemen })}>
                      {regel.meenemen ? 'Niet meenemen' : 'Toch meenemen'}
                    </Knop>
                  </div>
                  {regel.meenemen && zichtbaar.size > 0 && (
                    <div className={stijl.velden}>
                      {(Object.keys(VELD) as RegelVeld[])
                        .filter((veld) => zichtbaar.has(veld))
                        .map((veld) => (
                          <Veld
                            key={veld}
                            id={`regel-${regel.nr}-${veld}`}
                            label={VELD[veld].label}
                            hulp={fouten[veld] ? undefined : VELD[veld].hulp}
                            fout={fouten[veld]}
                            value={regel[veld]}
                            onChange={(e) => wijzig(index, { [veld]: e.target.value }, veld)}
                            autoComplete="off"
                          />
                        ))}
                    </div>
                  )}
                </div>
              </Lijstrij>
            );
          })}
        </Lijst>
      </Kaart>

      <div className={stijl.voet}>
        <p className={stijl.aantal}>
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
