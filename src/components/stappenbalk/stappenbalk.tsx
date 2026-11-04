// De Stappenbalk (Design-overdracht 3): waar je bent in een taak van twee stappen. Afmelden met een dienst is technisch twee
// schrijfacties, maar voor het lid één voornemen: "Stap 1 — vervanger aanwijzen, Stap 2 — afmelden bevestigen". Wie alleen zijn
// dienst overdraagt, doorloopt dezelfde schermen zonder balk (UX-FLOWS, "Eén taak, zichtbaar in stappen").
//
// Het is een geordende lijst; de huidige stap heeft aria-current="step". Een stap die klaar is, krijgt een vinkje en de
// verborgen tekst "klaar", zodat ook wie geen kleur of icoon ziet weet hoe het ervoor staat (bouwgids 14.3).

import { Icoon } from '@/components/icoon/icoon';

import stijl from './stappenbalk.module.css';

export type StapStatus = 'klaar' | 'huidig' | 'komt';

export interface Stap {
  label: string;
  status: StapStatus;
}

export function Stappenbalk({ stappen }: { stappen: Stap[] }) {
  return (
    <ol className={stijl.balk} aria-label="Stappen">
      {stappen.map((stap, i) => (
        <li
          key={stap.label}
          className={[stijl.stap, stijl[stap.status]].join(' ')}
          aria-current={stap.status === 'huidig' ? 'step' : undefined}
        >
          <span className={stijl.nummer} aria-hidden="true">
            {stap.status === 'klaar' ? <Icoon naam="succes" gewicht="bold" /> : i + 1}
          </span>
          <span>
            Stap {i + 1} — {stap.label}
            {stap.status === 'klaar' && <span className={stijl.alleenSchermlezer}> (klaar)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
