'use client';

import Image from 'next/image';
import { useActionState } from 'react';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Veld } from '@/components/veld/veld';
import { CODE_MELDINGEN } from '@/lib/mfa';

import { bevestigInstellen, type InstellenStaat } from '../acties';

import stijl from './formulier.module.css';

interface Eigenschappen {
  factorId: string;
  /** De QR-code als afbeelding (data-adres van Supabase). */
  qr: string;
  /** De geheime sleutel, in groepjes van vier om over te typen. */
  geheim: string;
}

// Een eigen onderdeel met staat: bij een foute code moet de QR dezelfde blijven. De sleutel is maar één keer op te
// vragen; een pagina die opnieuw laadt, zou een nieuwe app aanmaken en de al gescande app onbruikbaar maken.
export function InstellenFormulier({ factorId, qr, geheim }: Eigenschappen) {
  const [staat, actie, bezig] = useActionState<InstellenStaat, FormData>(bevestigInstellen, { fout: null });

  return (
    <form action={actie} className={stijl.stappen}>
      <input type="hidden" name="factor" value={factorId} />
      <Kaart titel="2. Scan deze code met de app">
        <p>Kies in de app het plusje of ‘Toevoegen’ en richt je camera op de code.</p>
        <div className="niet-op-mobiel">
          <Image
            src={qr}
            alt="QR-code om je authenticator-app te koppelen"
            width={200}
            height={200}
            unoptimized
          />
        </div>
        <p className="alleen-mobiel">
          Zit je op de telefoon waarop de app staat? Dan kun je de code niet scannen. Kopieer de code
          hieronder en plak hem in de app.
        </p>
        <p>
          Lukt scannen niet? Typ deze code over in de app
          <br />
          <code className={stijl.sleutel}>{geheim}</code>
        </p>
      </Kaart>
      <Kaart titel="3. Typ de 6 cijfers uit de app">
        <p>Zie je in de app een code van 6 cijfers bij De Beringse Kuus? Typ die hier.</p>
        <Veld
          id="code"
          name="code"
          label="Code uit de app"
          hulp="6 cijfers"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          fout={staat.fout ? CODE_MELDINGEN[staat.fout] : undefined}
        />
        <p>
          <Knop type="submit" disabled={bezig}>
            Bevestigen
          </Knop>
        </p>
      </Kaart>
    </form>
  );
}
