// "Je seizoen" op Mijn diensten (ontwerp 24-11-2026): je diensten van het hele seizoen als een lijn met bolletjes, op datum, in de stijl
// van de tijdlijn van het kaartje. Gevuld groen met een vinkje = gedaan, leeg = komt nog, grijs met een kruis = afgemeld. Het teken staat
// niet alleen in kleur: een schermlezer hoort "gedaan", "komt nog" of "afgemeld". Alleen op een groot scherm; op een telefoon is de
// kaart er niet (ontwerpbesluit: de lijsten ernaast zeggen genoeg).

import { Icoon } from '@/components/icoon/icoon';
import { Kaart } from '@/components/kaart/kaart';
import { rolIcoon } from '@/components/rolbezetting/rolbezetting';
import { rolLabel } from '@/lib/ledenactiviteit';
import { rolTekst, type SeizoenStaat, type SeizoenStop } from '@/lib/mijndiensten';
import { korteDatum } from '@/lib/programma';

import stijl from './seizoenslijn.module.css';

const STAAT: Record<SeizoenStaat, { klasse: string | undefined; tekst: string }> = {
  gedaan: { klasse: stijl.gedaan, tekst: 'gedaan' },
  komt: { klasse: stijl.komt, tekst: 'komt nog' },
  afgemeld: { klasse: stijl.afgemeld, tekst: 'afgemeld' },
};

export function Seizoenslijn({ stops }: { stops: SeizoenStop[] }) {
  return (
    <div className={stijl.alleenGroot}>
      <Kaart titel="Je seizoen">
        <ol className={stijl.lijn}>
          {stops.map((stop) => (
            <li key={stop.activiteitId} className={stijl.stop}>
              <span
                className={[stijl.bol, STAAT[stop.staat].klasse].filter(Boolean).join(' ')}
                aria-hidden="true"
              >
                {stop.staat === 'gedaan' && <Icoon naam="vinkje" />}
                {stop.staat === 'afgemeld' && <Icoon naam="kruis" />}
              </span>
              <strong className={stijl.datum}>{korteDatum(stop.datum)}</strong>
              <span className={stijl.tekst}>
                <strong className={stijl.naam}>{stop.naam}</strong>
                <span className={stijl.rol}>
                  {stop.rol !== null && <Icoon naam={rolIcoon(stop.rol)} className={stijl.rolIcoon} />}
                  {stop.rol !== null ? rolTekst([stop.rol], rolLabel) : 'afgemeld'}
                  {stop.staat !== 'afgemeld' && (
                    <span className={stijl.verborgen}>, {STAAT[stop.staat].tekst}</span>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Kaart>
    </div>
  );
}
