'use client';

import { useActionState, useEffect, useRef } from 'react';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Veld } from '@/components/veld/veld';

import { bevestigInlogcode, type InlogStaat, stuurInlogcode } from './acties';

import stijl from './formulier.module.css';

const BEGIN: InlogStaat = { email: '', verstuurd: false, fout: null };
const ADRES_FOUT =
  'Dit lijkt geen e-mailadres. Controleer of je het goed hebt getypt, bijvoorbeeld naam@example.com.';
const CODE_FOUTEN = {
  vorm: 'Vul de volledige cijfercode uit je mail in.',
  code: 'Deze code klopt niet of is verlopen. Controleer de code of vraag een nieuwe aan.',
  'te-vaak': 'Te vaak geprobeerd. Wacht een paar minuten en probeer het opnieuw.',
};

interface Eigenschappen {
  alVerstuurd: boolean;
  adresOngeldig: boolean;
}

export function InlogFormulier({ alVerstuurd, adresOngeldig }: Eigenschappen) {
  const [aanvraag, verstuur, mailBezig] = useActionState<InlogStaat, FormData>(stuurInlogcode, {
    ...BEGIN,
    fout: adresOngeldig ? 'adres' : null,
  });
  const [bevestiging, bevestig, codeBezig] = useActionState<InlogStaat, FormData>(bevestigInlogcode, BEGIN);
  const formulier = useRef<HTMLFormElement>(null);
  const codeFase = aanvraag.verstuurd || bevestiging.verstuurd || alVerstuurd;
  const email = bevestiging.email || aanvraag.email;

  useEffect(() => {
    if (aanvraag.verstuurd) formulier.current?.querySelector<HTMLInputElement>('[name="code"]')?.focus();
  }, [aanvraag.verstuurd]);

  if (codeFase) {
    const codeFout = bevestiging.fout;
    return (
      <>
        <Melding soort="info">
          Als dit e-mailadres bij ons bekend is, hebben we een code gestuurd. Neem de code uit je mail over.
        </Melding>
        <Kaart titel="Vul je inlogcode in">
          <form action={bevestig} ref={formulier}>
            <div className={stijl.velden}>
              <Veld
                id="email"
                name="email"
                label="E-mailadres"
                type="email"
                autoComplete="email"
                defaultValue={email}
                required
                fout={codeFout === 'adres' ? ADRES_FOUT : undefined}
              />
              <Veld
                id="code"
                name="code"
                label="Code uit je mail"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={20}
                required
                fout={codeFout && codeFout !== 'adres' ? CODE_FOUTEN[codeFout] : undefined}
              />
            </div>
            <p>
              <Knop type="submit" disabled={codeBezig}>
                Inloggen
              </Knop>
            </p>
          </form>
          <p>Geen code ontvangen? Kijk ook in je map met ongewenste mail.</p>
          <form action="/inloggen" method="get">
            <Knop type="submit" soort="secundair">
              Nieuwe code aanvragen
            </Knop>
          </form>
        </Kaart>
      </>
    );
  }

  return (
    <Kaart titel="Log in met je e-mailadres">
      <p>
        Vul het e-mailadres in waarmee je bij de vereniging staat. Je krijgt een code in je mail. Daarmee log
        je hier in. Een wachtwoord heb je niet nodig.
      </p>
      <form action={verstuur}>
        <Veld
          id="email"
          name="email"
          label="E-mailadres"
          type="email"
          autoComplete="email"
          defaultValue={aanvraag.email}
          required
          fout={aanvraag.fout === 'adres' ? ADRES_FOUT : undefined}
        />
        <p>
          <Knop type="submit" disabled={mailBezig}>
            Stuur mij een inlogcode
          </Knop>
        </p>
      </form>
      <p>
        <Knop href="/inloggen?code=1" soort="secundair">
          Ik heb al een code
        </Knop>
      </p>
    </Kaart>
  );
}
