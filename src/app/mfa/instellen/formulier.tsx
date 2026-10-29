'use client';

import Image from 'next/image';
import { useActionState } from 'react';

import { CODE_MELDINGEN } from '@/lib/mfa';

import { bevestigInstellen, type InstellenStaat } from '../acties';

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
    <form action={actie}>
      <input type="hidden" name="factor" value={factorId} />
      <h2>2. Scan deze code met de app</h2>
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
        Zit je op de telefoon waarop de app staat? Dan kun je de code niet scannen. Kopieer de code hieronder
        en plak hem in de app.
      </p>
      <p>
        Lukt scannen niet? Typ deze code over in de app
        <br />
        <code>{geheim}</code>
      </p>
      <h2>3. Typ de 6 cijfers uit de app</h2>
      <p>Zie je in de app een code van 6 cijfers bij De Beringse Kuus? Typ die hier.</p>
      <p>
        <label htmlFor="code">Code uit de app</label>
        <br />
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
          aria-invalid={staat.fout ? true : undefined}
          aria-describedby={staat.fout ? 'code-fout' : 'code-hulp'}
        />
        <br />
        <small id="code-hulp">6 cijfers</small>
      </p>
      {staat.fout && (
        <p id="code-fout" role="alert">
          {CODE_MELDINGEN[staat.fout]}
        </p>
      )}
      <p>
        <button type="submit" disabled={bezig}>
          Bevestigen
        </button>
      </p>
    </form>
  );
}
