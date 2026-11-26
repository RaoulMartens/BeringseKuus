import type { Metadata } from 'next';

import { Icoon } from '@/components/icoon/icoon';
import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { leesSeizoenen } from './gegevens';
import stijl from './bulk.module.css';

export const metadata: Metadata = { title: 'Meerdere activiteiten aanmaken – Ledenplatform' };

/**
 * Het begin van "meerdere activiteiten tegelijk aanmaken" (UC-006, wireframe admin-bulk-start): het vorige seizoen kopiëren of een
 * Excel-bestand importeren. Kopiëren staat er alleen als er een seizoen is om te kopiëren.
 */
export default async function MeerdereAanmaken() {
  await eisBeheer();
  const supabase = await maakSupabase();
  const seizoenen = await leesSeizoenen(supabase);
  const laatste = seizoenen[0];

  return (
    <Schermkader
      actief="beheer"
      titel="Meerdere activiteiten aanmaken"
      terug={{ href: '/beheer', tekst: 'Terug naar activiteiten' }}
    >
      <Kaart lijst>
        <Lijst zonderKop>
          {laatste && (
            <Lijstrij href="/beheer/activiteiten/bulk/kopieren">
              <span className={stijl.icoonvlak}>
                <Icoon naam="kalender-herhalen" />
              </span>
              <span className={stijl.keuze}>
                <strong className={stijl.keuzetitel}>Vorig seizoen kopiëren</strong>
                <span className={stijl.keuzehulp}>
                  {laatste.naam} ·{' '}
                  {laatste.activiteiten.length === 1
                    ? '1 activiteit'
                    : `${laatste.activiteiten.length} activiteiten`}
                </span>
              </span>
            </Lijstrij>
          )}
          <Lijstrij href="/beheer/activiteiten/bulk/importeren">
            <span className={stijl.icoonvlak}>
              <Icoon naam="xlsx" />
            </span>
            <span className={stijl.keuze}>
              <strong className={stijl.keuzetitel}>Excel-bestand importeren</strong>
              <span className={stijl.keuzehulp}>Met het sjabloon van de vereniging</span>
            </span>
          </Lijstrij>
        </Lijst>
      </Kaart>
    </Schermkader>
  );
}
