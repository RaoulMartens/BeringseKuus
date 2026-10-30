import type { Metadata } from 'next';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Veld } from '@/components/veld/veld';

import { stuurInloglink } from './acties';

export const metadata: Metadata = { title: 'Inloggen – Ledenplatform' };

type Zoekparameters = Promise<Record<string, string | string[] | undefined>>;

// De schermen van het inloggen (wireframes inloggen, inloggen-fout-adres, inloggen-verstuurd, inloggen-link-ongeldig en
// uitgelogd). Het is een gastscherm: zonder menu en zonder de database te vragen. De tekst staat letterlijk in de wireframes.
export default async function Inloggen({ searchParams }: { searchParams: Zoekparameters }) {
  const zoek = await searchParams;

  // Na het aanvragen: altijd hetzelfde antwoord, ook bij een onbekend adres (zo verraadt de pagina niet wie lid is).
  if (zoek.verstuurd === '1') {
    return (
      <Schermkader gast titel="Kijk in je mail">
        <Melding soort="info">
          Als dit e-mailadres bij ons bekend is, hebben we een link gestuurd. Open de mail en tik op de link
          om in te loggen.
        </Melding>
        <Kaart titel="Nog niets ontvangen?">
          <p>
            Het kan een paar minuten duren. Kijk ook in je map met ongewenste mail. De link werkt één keer en
            is een uur geldig.
          </p>
          <p>Lukt het niet? Vraag het bestuur om te kijken welk e-mailadres bij jou staat.</p>
          <p>
            <Knop href="/inloggen" soort="secundair">
              Nieuwe link aanvragen
            </Knop>
          </p>
        </Kaart>
      </Schermkader>
    );
  }

  const linkOngeldig = zoek.fout === 'link';
  const adresOngeldig = zoek.fout === 'ongeldig';

  return (
    <Schermkader gast titel={linkOngeldig ? 'Deze link werkt niet meer' : 'Inloggen'}>
      {zoek.uitgelogd === '1' && <Melding soort="info">Je bent uitgelogd. Tot de volgende keer.</Melding>}
      {linkOngeldig && (
        <Melding soort="let-op" rol="alert">
          De link uit je mail is verlopen of al gebruikt. Een inloglink werkt één keer en is een uur geldig.
          Er is niets mis met je account.
        </Melding>
      )}
      <Kaart titel={linkOngeldig ? 'Vraag een nieuwe link aan' : 'Log in met je e-mailadres'}>
        {!linkOngeldig && (
          <p>
            Vul het e-mailadres in waarmee je bij de vereniging staat. Je krijgt een link in je mail; daarmee
            ben je binnen. Een wachtwoord heb je niet nodig.
          </p>
        )}
        <form action={stuurInloglink}>
          <Veld
            id="email"
            name="email"
            label="E-mailadres"
            type="email"
            autoComplete="email"
            required
            fout={
              adresOngeldig
                ? 'Dit lijkt geen e-mailadres. Controleer of je het goed hebt getypt, bijvoorbeeld naam@example.com.'
                : undefined
            }
          />
          <p>
            <Knop type="submit">
              {linkOngeldig ? 'Stuur mij een nieuwe link' : 'Stuur mij een inloglink'}
            </Knop>
          </p>
        </form>
      </Kaart>
    </Schermkader>
  );
}
