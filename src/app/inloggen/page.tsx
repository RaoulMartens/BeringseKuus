import type { Metadata } from 'next';

import { stuurInloglink } from './acties';

import { Eenvoudig } from '@/components/eenvoudig/eenvoudig';

export const metadata: Metadata = { title: 'Inloggen – Ledenplatform' };

type Zoekparameters = Promise<Record<string, string | string[] | undefined>>;

const MELDINGEN = {
  verstuurd:
    'Als dit e-mailadres bij ons bekend is, hebben we je een inloglink gestuurd. Kijk in je mail; de link is een uur geldig.',
  uitgelogd: 'Je bent uitgelogd.',
  ongeldig: 'Vul een geldig e-mailadres in.',
  link: 'De inloglink is verlopen of al gebruikt. Vraag hieronder een nieuwe aan.',
} as const;

export default async function Inloggen({ searchParams }: { searchParams: Zoekparameters }) {
  const zoek = await searchParams;
  const fout = zoek.fout === 'ongeldig' || zoek.fout === 'link' ? zoek.fout : null;
  const status =
    zoek.verstuurd === '1' ? MELDINGEN.verstuurd : zoek.uitgelogd === '1' ? MELDINGEN.uitgelogd : null;

  return (
    <Eenvoudig>
      <main>
        <h1>Inloggen</h1>
        {status && <p role="status">{status}</p>}
        {fout === 'link' && <p role="alert">{MELDINGEN.link}</p>}
        <form action={stuurInloglink}>
          <p>
            <label htmlFor="email">E-mailadres</label>
            <br />
            {/* Een fout bij het veld is eraan gekoppeld, zodat een schermlezer hem voorleest (bouwgids 14.3). */}
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={fout === 'ongeldig' ? true : undefined}
              aria-describedby={fout === 'ongeldig' ? 'email-fout' : undefined}
            />
          </p>
          {fout === 'ongeldig' && (
            <p id="email-fout" role="alert">
              {MELDINGEN.ongeldig}
            </p>
          )}
          <p>
            <button type="submit">Stuur inloglink</button>
          </p>
        </form>
      </main>
    </Eenvoudig>
  );
}
