'use client';

// De rolbezetting van een activiteit (UC-004 stap 6 en UC-005): per rol de plekken, bezet of leeg. De naam is het veld:
// een keuzelijst met de leden en externe helpers die er kunnen staan. Bij een bezette plek staat onderaan "<naam> eraf
// halen" met twee uitkomsten: "Plek openlaten" of "Plek weghalen" (BA-2). Er is geen getalveld: het aantal plekken is het
// aantal regels, en lege plekken voeg je toe of haal je weg. Wat de beheerder wijzigt, blijft op het scherm staan tot
// Opslaan en gaat dan in één keer naar de server (activiteit_opslaan, BG 4.4).
//
// Elke plek is een keuzelijst (`plek_<id>`) met, verborgen, wie er stond toen het scherm werd getoond (`plek_was_<id>`):
// dat gaat mee als `verwachte_bezetter`. De eindverantwoordelijke is vast: precies één plek, geen kruisje en geen plus
// (R21), en alleen een lid. Wie al op een andere plek staat of zich heeft afgemeld, kun je niet kiezen; wie nog niet is
// aangemerkt als geschikt voor BOB of eindverantwoordelijke, staat er met een hint (R19: een hulp, geen blokkade).

import { useId, useState } from 'react';

import { Icoon } from '@/components/icoon/icoon';
import { Knop } from '@/components/knop/knop';
import { rolIcoon } from '@/components/rolbezetting/rolbezetting';
import {
  helperVeld,
  PLEK_HELPER,
  PLEK_LEEGMAKEN,
  PLEK_WEGHALEN,
  TEKENS_HELPER,
} from '@/lib/activiteitformulier';
import { rolLabel, vergelijkRollen } from '@/lib/rollen';

import type { Kandidaat } from './gegevens';

import stijl from './plekken.module.css';

export interface BestaandePlek {
  id: string;
  rol: string;
  /** Wie er staat; leeg als de plek leeg is. */
  bezetter: string | null;
  bezetterId: string | null;
}

export interface Eindverantwoordelijke {
  /** Het id van de plek; leeg als de activiteit nog niet bestaat (de plek komt er bij het opslaan). */
  slotId: string | null;
  bezetterId: string | null;
  /** Wie er staat; leeg als de plek nog leeg is. */
  naam: string | null;
  telefoon: string | null;
  /** De activiteit bestaat nog niet: de plek komt er bij het opslaan. */
  nieuw: boolean;
}

/** Een rol die de beheerder kan kiezen (roltypen met toevoegbaar), in de volgorde van de lijst. */
export interface Rolkeuze {
  code: string;
  naam: string;
}

interface Eigenschappen {
  /** De rollen die de beheerder kan kiezen. */
  rollen: Rolkeuze[];
  bestaand: BestaandePlek[];
  eindverantwoordelijke: Eindverantwoordelijke;
  kandidaten: Kandidaat[];
  /** Wie zich voor deze activiteit heeft afgemeld. */
  afgemeld: string[];
  /** Wat de beheerder al had gewijzigd (na een fout komt het terug): ids van weggehaalde plekken en nieuwe plekken als "rol:naam". */
  beginWeggehaald?: string[];
  beginToegevoegd?: string[];
  /** Wat er in de keuzelijsten stond (na een fout), per veldnaam. */
  beginKeuzes?: Record<string, string>;
  /** Een fout bij de plekken, na het versturen. */
  fout?: string;
  /** De activiteit is gepubliceerd: de eindverantwoordelijke is vast en kan alleen rechtstreeks worden vervangen (R21). */
  gepubliceerd?: boolean;
}

interface NieuwePlek {
  tijdelijk: string;
  /** De code van de rol ("tapper"). */
  rol: string;
}

/** De nieuwe plekken uit de formulierwaarden "tapper:n1"; wat niet klopt, wordt overgeslagen (de server controleert ook). */
function leesNieuwePlekken(waarden: string[]): NieuwePlek[] {
  return waarden.flatMap((waarde) => {
    const [rol, tijdelijk] = waarde.split(':');
    return rol && tijdelijk ? [{ rol, tijdelijk }] : [];
  });
}

/** Het naamveld voor iemand van buiten de vereniging, onder de keuzelijst van de plek `veld`: alleen een naam. */
function HelperNaam({ veld, label, begin }: { veld: string; label: string; begin?: Record<string, string> }) {
  const naam = helperVeld(veld);
  return (
    <label className={stijl.helper}>
      <span className={stijl.verborgen}>Naam van iemand van buiten de vereniging, {label}</span>
      <input
        name={naam}
        type="text"
        required
        maxLength={TEKENS_HELPER}
        autoComplete="off"
        placeholder="Naam"
        defaultValue={begin?.[naam] ?? ''}
        className={stijl.invoer}
      />
    </label>
  );
}

/** Het label van een keuze: de naam, met erachter waarom het niet of met een kanttekening kan. */
function optieLabel(kandidaat: Kandidaat, rol: string, reden: string | null): string {
  const delen = [kandidaat.naam];
  if (kandidaat.extern) delen.push('(extern)');
  if (reden) delen.push(`— ${reden}`);
  else if (rol === 'bob' && !kandidaat.magBob) delen.push('— nog niet aangemerkt als BOB');
  else if (rol === 'eindverantwoordelijke' && !kandidaat.magEindverantwoordelijke) {
    delen.push('— nog niet aangemerkt als eindverantwoordelijke');
  }
  return delen.join(' ');
}

interface KeuzelijstEigenschappen {
  /** De naam van het veld in het formulier. */
  naam: string;
  /** Wat een schermlezer voorleest ("Werker 1"). */
  label: string;
  rol: string;
  kandidaten: Kandidaat[];
  afgemeld: string[];
  /** Wie er op andere plekken staat of is gekozen: die kun je hier niet kiezen. */
  elders: Set<string>;
  waarde: string;
  /** Wie er bij het tonen op deze plek stond (leeg als niemand). */
  bezetterId: string | null;
  bezetterNaam: string | null;
  /** Bij een bezette plek: "<naam> eraf halen" met openlaten en weghalen. */
  eraf: boolean;
  /** De eindverantwoordelijke kan niet worden weggehaald, alleen worden opengelaten. */
  alleenOpenlaten?: boolean;
  onWijzig: (waarde: string) => void;
}

/** Een BOB of eindverantwoordelijke is een lid (R17); op elke andere plek mag ook iemand van buiten de vereniging. */
function magExtern(rol: string): boolean {
  return rol !== 'bob' && rol !== 'eindverantwoordelijke';
}

function Keuzelijst({
  naam,
  label,
  rol,
  kandidaten,
  afgemeld,
  elders,
  waarde,
  bezetterId,
  bezetterNaam,
  eraf,
  alleenOpenlaten,
  onWijzig,
}: KeuzelijstEigenschappen) {
  const geschikt = kandidaten.filter((k) => !k.extern || magExtern(rol));
  const stond = bezetterId && !geschikt.some((k) => k.id === bezetterId);
  return (
    <>
      <label htmlFor={naam} className={stijl.verborgen}>
        {label}
      </label>
      <select
        id={naam}
        name={naam}
        className={stijl.keuze}
        defaultValue={waarde}
        onChange={(e) => onWijzig(e.target.value)}
      >
        {!bezetterId && <option value="">Kies iemand…</option>}
        {/* Wie er stond maar niet meer te kiezen is (bijvoorbeeld op inactief gezet), blijft zichtbaar zolang hij er staat. */}
        {stond && <option value={bezetterId}>{bezetterNaam ?? 'Onbekend'}</option>}
        {geschikt.map((kandidaat) => {
          const reden = afgemeld.includes(kandidaat.id)
            ? 'afgemeld'
            : elders.has(kandidaat.id)
              ? 'al ingedeeld'
              : null;
          return (
            <option
              key={kandidaat.id}
              value={kandidaat.id}
              disabled={reden !== null && kandidaat.id !== waarde}
            >
              {optieLabel(kandidaat, rol, reden)}
            </option>
          );
        })}
        {magExtern(rol) && (
          <optgroup label="Staat niet in de lijst?">
            <option value={PLEK_HELPER}>Iemand van buiten de vereniging…</option>
          </optgroup>
        )}
        {eraf && (
          <optgroup label={`${bezetterNaam ?? 'Deze persoon'} eraf halen`}>
            <option value={PLEK_LEEGMAKEN}>Plek openlaten</option>
            {!alleenOpenlaten && <option value={PLEK_WEGHALEN}>Plek weghalen</option>}
          </optgroup>
        )}
      </select>
    </>
  );
}

export function Plekken({
  rollen,
  bestaand,
  eindverantwoordelijke,
  kandidaten,
  afgemeld,
  beginWeggehaald = [],
  beginToegevoegd = [],
  beginKeuzes,
  fout,
  gepubliceerd = false,
}: Eigenschappen) {
  const [weggehaald, zetWeggehaald] = useState<string[]>(beginWeggehaald);
  const [nieuw, zetNieuw] = useState<NieuwePlek[]>(() => leesNieuwePlekken(beginToegevoegd));
  const [teller, zetTeller] = useState(1);
  const basis = useId().replace(/[^A-Za-z0-9]/g, '');

  // De naam van het veld bij een plek, en wat er in de keuzelijst staat: eerst wat de beheerder had gekozen (na een fout),
  // anders wie er stond.
  const evNaam = eindverantwoordelijke.slotId
    ? `plek_${eindverantwoordelijke.slotId}`
    : 'plek_eindverantwoordelijke';
  const beginWaarde = (naam: string, standaard: string): string => beginKeuzes?.[naam] ?? standaard;
  const [keuzes, zetKeuzes] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {
      [evNaam]: beginWaarde(evNaam, eindverantwoordelijke.bezetterId ?? ''),
    };
    for (const plek of bestaand)
      start[`plek_${plek.id}`] = beginWaarde(`plek_${plek.id}`, plek.bezetterId ?? '');
    for (const plek of leesNieuwePlekken(beginToegevoegd)) {
      start[`plek_nieuw_${plek.tijdelijk}`] = beginWaarde(`plek_nieuw_${plek.tijdelijk}`, '');
    }
    return start;
  });
  /** Wie er nu als eindverantwoordelijke is gekozen (of stond), om te waarschuwen als hij geen telefoonnummer heeft. */
  const gekozenEv = kandidaten.find((k) => k.id === keuzes[evNaam]);
  const wijzig = (naam: string, waarde: string): void =>
    zetKeuzes((vorige) => ({ ...vorige, [naam]: waarde }));

  /** Wie er op een andere plek staat dan deze (bestaand en gekozen), zodat hij hier niet nog een keer te kiezen is. */
  function elders(eigen: string): Set<string> {
    const uit = new Set<string>();
    for (const [naam, lid] of Object.entries(keuzes)) {
      if (naam !== eigen && lid !== '' && lid !== PLEK_LEEGMAKEN && lid !== PLEK_WEGHALEN) uit.add(lid);
    }
    return uit;
  }

  // De keuze onderaan: welke rol de nieuwe plek krijgt. Alleen de rollen uit de lijst; iemand van buiten de vereniging
  // kies je in de keuzelijst van de plek zelf.
  const [gekozenRol, zetGekozenRol] = useState(rollen[0]?.code ?? '');

  /** De kop van een rol: de naam uit de lijst, anders de vaste naam (werker, die niet meer in de lijst staat). */
  const kopVan = (rol: string): string => rollen.find((r) => r.code === rol)?.naam ?? rolLabel(rol);

  function voegToe(rol: string) {
    const tijdelijk = `n${basis}${teller}`;
    zetNieuw((vorige) => [...vorige, { tijdelijk, rol }]);
    zetKeuzes((vorige) => ({ ...vorige, [`plek_nieuw_${tijdelijk}`]: '' }));
    zetTeller((vorige) => vorige + 1);
  }

  function haalNieuweWeg(tijdelijk: string) {
    zetNieuw((vorige) => vorige.filter((p) => p.tijdelijk !== tijdelijk));
    zetKeuzes((vorige) => {
      const rest = { ...vorige };
      delete rest[`plek_nieuw_${tijdelijk}`];
      return rest;
    });
  }

  function haalBestaandeWeg(id: string) {
    zetWeggehaald((vorige) => [...vorige, id]);
    zetKeuzes((vorige) => {
      const rest = { ...vorige };
      delete rest[`plek_${id}`];
      return rest;
    });
  }

  // De rollen met plekken, in de volgorde van de lijst; een rol die er niet (meer) in staat, zoals werker, erachter.
  const plaats = (rol: string): number => {
    const index = rollen.findIndex((r) => r.code === rol);
    return index === -1 ? rollen.length : index;
  };
  const zichtbareRollen = [
    ...new Set([
      ...bestaand.filter((plek) => !weggehaald.includes(plek.id)).map((plek) => plek.rol),
      ...nieuw.map((plek) => plek.rol),
    ]),
  ].sort((a, b) => plaats(a) - plaats(b) || vergelijkRollen(a, b));

  return (
    <div className={stijl.plekken}>
      <p className={stijl.uitleg}>
        Kies iemand voor een plek. Wil je iemand eraf halen, dan kies je onderaan de lijst: de plek openlaten
        of weghalen.
      </p>

      {zichtbareRollen.map((rol, index) => {
        const kop = kopVan(rol);
        const inZin = kop === 'BOB' ? kop : kop.toLowerCase();
        const kopId = `${basis}-rol-${index}`;
        const vast = bestaand.filter((plek) => plek.rol === rol && !weggehaald.includes(plek.id));
        const toegevoegd = nieuw.filter((plek) => plek.rol === rol);
        // Werker is te algemeen en kan er niet meer bij; een bestaande werker-plek blijft wel te zien en in te delen.
        const toevoegbaar = rollen.some((r) => r.code === rol);
        return (
          <section key={rol} aria-labelledby={kopId} className={stijl.rol}>
            <h3 id={kopId} className={stijl.rolkop}>
              <Icoon naam={rolIcoon(rol)} />
              {kop}
            </h3>
            <ul className={stijl.lijst}>
              {vast.map((plek, nummer) => {
                const naam = `plek_${plek.id}`;
                const bezet = plek.bezetterId !== null;
                return (
                  <li key={plek.id} className={stijl.plek}>
                    <input type="hidden" name={`plek_was_${plek.id}`} value={plek.bezetterId ?? ''} />
                    <Keuzelijst
                      naam={naam}
                      label={`${kop} ${nummer + 1}`}
                      rol={rol}
                      kandidaten={kandidaten}
                      afgemeld={afgemeld}
                      elders={elders(naam)}
                      waarde={keuzes[naam] ?? ''}
                      bezetterId={plek.bezetterId}
                      bezetterNaam={plek.bezetter}
                      eraf={bezet}
                      onWijzig={(waarde) => wijzig(naam, waarde)}
                    />
                    {!bezet && (
                      <button
                        type="button"
                        className={stijl.weg}
                        aria-label={`Lege plek ${nummer + 1} van ${inZin} weghalen`}
                        onClick={() => haalBestaandeWeg(plek.id)}
                      >
                        <Icoon naam="kruis" />
                      </button>
                    )}
                    {keuzes[naam] === PLEK_HELPER && (
                      <HelperNaam veld={naam} label={`${kop} ${nummer + 1}`} begin={beginKeuzes} />
                    )}
                  </li>
                );
              })}
              {toegevoegd.map((plek, nummer) => {
                const naam = `plek_nieuw_${plek.tijdelijk}`;
                return (
                  <li key={plek.tijdelijk} className={stijl.plek}>
                    <Keuzelijst
                      naam={naam}
                      label={`Nieuwe plek ${nummer + 1} van ${inZin}`}
                      rol={rol}
                      kandidaten={kandidaten}
                      afgemeld={afgemeld}
                      elders={elders(naam)}
                      waarde={keuzes[naam] ?? ''}
                      bezetterId={null}
                      bezetterNaam={null}
                      eraf={false}
                      onWijzig={(waarde) => wijzig(naam, waarde)}
                    />
                    <button
                      type="button"
                      className={stijl.weg}
                      aria-label={`Nieuwe plek ${nummer + 1} van ${inZin} weghalen`}
                      onClick={() => haalNieuweWeg(plek.tijdelijk)}
                    >
                      <Icoon naam="kruis" />
                    </button>
                    {keuzes[naam] === PLEK_HELPER && (
                      <HelperNaam
                        veld={naam}
                        label={`nieuwe plek ${nummer + 1} van ${inZin}`}
                        begin={beginKeuzes}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {toevoegbaar && (
              <Knop soort="tekst" icoon="plus" icoonGewicht="bold" vol onClick={() => voegToe(rol)}>
                <span className={stijl.verborgen}>Nog een </span>
                {`${inZin}-plek`}
              </Knop>
            )}
          </section>
        );
      })}

      <div className={stijl.toevoegen}>
        <label htmlFor={`${basis}-nieuwe-rol`} className={stijl.rolkop}>
          Plek toevoegen
        </label>
        <div className={stijl.toevoegRij}>
          <select
            id={`${basis}-nieuwe-rol`}
            className={stijl.keuze}
            value={gekozenRol}
            onChange={(e) => zetGekozenRol(e.target.value)}
          >
            {rollen.map((r) => (
              <option key={r.code} value={r.code}>
                {r.naam}
              </option>
            ))}
          </select>
          <Knop soort="secundair" icoon="plus" icoonGewicht="bold" onClick={() => voegToe(gekozenRol)}>
            Toevoegen
          </Knop>
        </div>
      </div>

      <section aria-labelledby="rol-eindverantwoordelijke" className={stijl.rol}>
        <h3 id="rol-eindverantwoordelijke" className={stijl.rolkop}>
          <Icoon naam="rol-eindverantwoordelijke" />
          Eindverantwoordelijke *
        </h3>
        <div className={stijl.lijst}>
          <div className={stijl.plek}>
            {eindverantwoordelijke.slotId && (
              <input
                type="hidden"
                name={`plek_was_${eindverantwoordelijke.slotId}`}
                value={eindverantwoordelijke.bezetterId ?? ''}
              />
            )}
            <Keuzelijst
              naam={evNaam}
              label="Eindverantwoordelijke"
              rol="eindverantwoordelijke"
              kandidaten={kandidaten}
              afgemeld={afgemeld}
              elders={elders(evNaam)}
              waarde={keuzes[evNaam] ?? ''}
              bezetterId={eindverantwoordelijke.bezetterId}
              bezetterNaam={eindverantwoordelijke.naam}
              eraf={eindverantwoordelijke.bezetterId !== null && !gepubliceerd}
              alleenOpenlaten
              onWijzig={(waarde) => wijzig(evNaam, waarde)}
            />
          </div>
        </div>
        {eindverantwoordelijke.telefoon && gekozenEv?.id === eindverantwoordelijke.bezetterId && (
          <p className={stijl.notitie}>
            <Icoon naam="telefoon" />
            <span className={stijl.verborgen}>Telefoon: </span>
            {eindverantwoordelijke.telefoon}
          </p>
        )}
        {gekozenEv && !gekozenEv.telefoon && (
          <p role="status" className={stijl.notitie}>
            {gekozenEv.naam} heeft nog geen telefoonnummer. De eindverantwoordelijke heeft er een nodig:
            zonder nummer kan de activiteit niet worden gepubliceerd en zien leden geen nummer. Een nummer
            toevoegen kan nog niet in dit scherm: vraag de bouwer van het platform het in de ledenlijst te
            zetten, of kies iemand met een nummer.
          </p>
        )}
        {gepubliceerd && (
          <p className={stijl.notitie}>
            Bij een gepubliceerde activiteit blijft er altijd een eindverantwoordelijke: kies een ander, je
            kunt de plek niet openlaten.
          </p>
        )}
      </section>

      {weggehaald.map((id) => (
        <input key={id} type="hidden" name="plek_weghalen" value={id} />
      ))}
      {nieuw.map((plek) => (
        <input
          key={plek.tijdelijk}
          type="hidden"
          name="plek_toevoegen"
          value={`${plek.rol}:${plek.tijdelijk}`}
        />
      ))}
      {fout && (
        <p role="alert" className={stijl.fout}>
          {fout}
        </p>
      )}
    </div>
  );
}
