// Tellers die ook filter zijn (docs/visueel/stijl.css, sectie 11): een getal met wat het telt, en een klik laat alleen die
// activiteiten zien. Het gekozen filter heeft een gevuld grijs vlak en `aria-current`; nog een keer klikken (of "Alles tonen")
// haalt het weg. Een teller op nul is zachter. Op elk scherm zijn het afgeronde labels naast elkaar, zodat ze niet op de knoppen
// lijken en niet zwaarder wegen dan de lijst waar ze bij horen (ontwerpbesluit 16-10-2026).

import Link from 'next/link';

import stijl from './tellers.module.css';

export interface Teller {
  /** Waar de klik naartoe gaat: het filter, of (bij het gekozen filter) terug naar alles. */
  href: string;
  aantal: number;
  /** "diensten nog in te delen". */
  label: string;
  actief: boolean;
}

export function Tellers({ tellers, naam, inKaart }: { tellers: Teller[]; naam: string; inKaart?: boolean }) {
  return (
    <nav
      aria-label={naam}
      className={[stijl.tellers, inKaart ? stijl.inKaart : undefined].filter(Boolean).join(' ')}
    >
      {tellers.map((teller) => (
        <Link
          key={teller.label}
          href={teller.href}
          aria-current={teller.actief ? 'true' : undefined}
          className={[
            stijl.teller,
            teller.actief ? stijl.actief : undefined,
            teller.aantal === 0 ? stijl.nul : undefined,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <b className={stijl.aantal}>{teller.aantal}</b> {teller.label}
        </Link>
      ))}
    </nav>
  );
}
