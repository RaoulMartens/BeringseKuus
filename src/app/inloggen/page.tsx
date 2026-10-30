import type { Metadata } from 'next';

import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';

import { InlogFormulier } from './formulier';

export const metadata: Metadata = { title: 'Inloggen – Ledenplatform' };

type Zoekparameters = Promise<Record<string, string | string[] | undefined>>;

export default async function Inloggen({ searchParams }: { searchParams: Zoekparameters }) {
  const zoek = await searchParams;
  return (
    <Schermkader gast titel="Inloggen">
      {zoek.uitgelogd === '1' && <Melding soort="info">Je bent uitgelogd. Tot de volgende keer.</Melding>}
      {zoek.fout === 'link' && (
        <Melding soort="let-op" rol="alert">
          De link uit je mail is verlopen of al gebruikt. Vraag hieronder een inlogcode aan.
        </Melding>
      )}
      <InlogFormulier
        alVerstuurd={zoek.verstuurd === '1' || zoek.code === '1'}
        adresOngeldig={zoek.fout === 'ongeldig'}
      />
    </Schermkader>
  );
}
