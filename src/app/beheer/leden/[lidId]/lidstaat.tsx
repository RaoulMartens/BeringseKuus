'use client';

// Het scherm van één lid (wireframe admin-lid): het formulier in de hoofdkolom en het statuspaneel in de zijkolom delen wat er is gewijzigd,
// zodat het paneel "N wijzigingen nog niet opgeslagen" kan zeggen en de knop alleen groen is als er iets te bewaren is (ontwerpbesluit
// 26-11-2026). De staat staat hier in één provider om beide kolommen heen; wat de database daarna doet, staat in lid_opslaan.

import { createContext, useActionState, useContext, useState, type ReactNode } from 'react';

import { Aankruislijst } from '@/components/aankruislijst/aankruislijst';
import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Statuspaneel } from '@/components/statuspaneel/statuspaneel';
import { Veld } from '@/components/veld/veld';
import { AANMERKINGEN, telWijzigingen, wijzigingenTekst } from '@/lib/leden';

import { slaLidOp, type LedenStaat } from '../acties';
import stijl from '../leden.module.css';

const FORMULIER_ID = 'lid-formulier';
const START: LedenStaat = { melding: null };

interface Waarden {
  telefoon: string;
  groepen: string[];
  aanmerkingen: string[];
}

interface Kader {
  begin: Waarden;
  nu: Waarden;
  zet: (deel: Partial<Waarden>) => void;
  wijzigingen: number;
}

const Staat = createContext<Kader | null>(null);

function useKader(): Kader {
  const kader = useContext(Staat);
  if (!kader) throw new Error('Lidstaat ontbreekt: gebruik Lidscherm als omhulling.');
  return kader;
}

/** Omhult formulier en paneel, zodat ze dezelfde wijzigingen zien. */
export function Lidscherm({ begin, children }: { begin: Waarden; children: ReactNode }) {
  const [nu, zetNu] = useState<Waarden>(begin);
  const kader: Kader = {
    begin,
    nu,
    zet: (deel) => zetNu((vorige) => ({ ...vorige, ...deel })),
    wijzigingen: telWijzigingen(begin, nu),
  };
  return <Staat.Provider value={kader}>{children}</Staat.Provider>;
}

interface Groep {
  id: string;
  naam: string;
  aantal: number;
}

export function Lidformulier({
  lidId,
  voornaam,
  groepen,
}: {
  lidId: string;
  voornaam: string;
  groepen: Groep[];
}) {
  const { begin, nu, zet } = useKader();
  const [staat, voerUit] = useActionState<LedenStaat, FormData>(slaLidOp, START);

  return (
    <form id={FORMULIER_ID} action={voerUit} className={stijl.formulier}>
      <input type="hidden" name="lid_id" value={lidId} />
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
          {staat.activiteiten && staat.activiteiten.length > 0 && (
            <ul className={stijl.blokkade}>
              {staat.activiteiten.map((a) => (
                <li key={`${a.naam}-${a.datum}`}>{a.naam}</li>
              ))}
            </ul>
          )}
        </Melding>
      )}
      <Kaart>
        <Veld
          id="telefoon"
          name="telefoon"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          label="Telefoonnummer"
          hulp={`Leden zien dit alleen bij activiteiten waar ${voornaam} eindverantwoordelijke is. Een nummer wissen kan niet.`}
          maxLength={30}
          value={nu.telefoon}
          onChange={(e) => zet({ telefoon: e.target.value })}
          gewijzigd={nu.telefoon.trim() !== begin.telefoon.trim()}
        />
      </Kaart>
      <Kaart>
        <Aankruislijst
          naam="groep"
          legenda="Groepen"
          uitleg="Leden zien alleen activiteiten van hun groepen."
          opties={groepen.map((g) => ({ waarde: g.id, label: g.naam, toelichting: `${g.aantal} leden` }))}
          gekozen={begin.groepen}
          vast
          onWijzig={(groepen) => zet({ groepen })}
        />
      </Kaart>
      <Kaart>
        <Aankruislijst
          naam="aanmerking"
          legenda="Bijzondere rollen"
          uitleg="Wie dit niet mag, kun je bij het indelen toch kiezen. Er staat dan “niet aangemerkt” bij de naam."
          opties={AANMERKINGEN.map((a) => ({ waarde: a.waarde, label: a.label }))}
          gekozen={begin.aanmerkingen}
          vast
          onWijzig={(aanmerkingen) => zet({ aanmerkingen })}
        />
      </Kaart>
    </form>
  );
}

/** Het statuspaneel: wat er is gewijzigd, de knop (groen als er iets te bewaren is) en de tekstlink naar inactief zetten. */
export function Lidpaneel({
  lidId,
  kanInactief,
  reden,
}: {
  lidId: string;
  kanInactief: boolean;
  reden?: string;
}) {
  const { wijzigingen } = useKader();
  return (
    <Statuspaneel
      status={wijzigingenTekst(wijzigingen)}
      uitleg={reden}
      onderaan={
        kanInactief ? (
          <Knop href={`/beheer/leden/${lidId}/inactief`} soort="tekst-gevaar">
            Op inactief zetten
          </Knop>
        ) : undefined
      }
    >
      <Knop
        type="submit"
        soort="positief"
        icoon="opslaan"
        formulier={FORMULIER_ID}
        disabled={wijzigingen === 0}
      >
        Wijzigingen opslaan
      </Knop>
    </Statuspaneel>
  );
}
