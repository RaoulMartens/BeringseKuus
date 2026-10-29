'use server';

import { redirect } from 'next/navigation';

import { normaliseerCode } from '@/lib/mfa';
import { maakSupabase } from '@/lib/supabase/server';

export interface InstellenStaat {
  /** Wat er mis ging bij de vorige poging, of null. */
  fout: 'code' | 'druk' | 'sessie' | null;
}

// GoTrue geeft 429 bij te veel pogingen binnen korte tijd; dat is geen foute code maar een rem.
const TE_DRUK = 429;

/** De code bij het inloggen in beheer: bewijst met de app dat de sessie van het bestuurslid is (aal2). */
export async function bevestigCode(formulier: FormData): Promise<void> {
  const code = normaliseerCode(formulier.get('code'));
  if (!code) redirect('/mfa/code?fout=code');

  const supabase = await maakSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/inloggen');

  // listFactors geeft in `totp` alleen de bevestigde apps.
  const lijst = await supabase.auth.mfa.listFactors();
  const factor = lijst.data?.totp[0];
  if (!factor) redirect('/mfa/instellen');

  const uitdaging = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (uitdaging.error) {
    console.error(`mfa-uitdaging mislukt: ${uitdaging.error.code ?? uitdaging.error.name}`);
    redirect(`/mfa/code?fout=${uitdaging.error.status === TE_DRUK ? 'druk' : 'sessie'}`);
  }
  const { error } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: uitdaging.data.id,
    code,
  });
  if (error) {
    // Nooit de code of de gebruiker in het log, alleen de soort fout (bouwgids 14.4).
    console.error(`mfa-code niet geaccepteerd: ${error.code ?? error.name}`);
    redirect(`/mfa/code?fout=${error.status === TE_DRUK ? 'druk' : 'code'}`);
  }
  // Waarheen na de code staat vast, net als bij het inloggen. Beheer beslist zelf of deze sessie erin mag.
  redirect('/beheer');
}

/** De eerste code na het scannen: bevestigt de app. Bij een fout blijft de gebruiker op de pagina met dezelfde QR. */
export async function bevestigInstellen(
  _vorige: InstellenStaat,
  formulier: FormData,
): Promise<InstellenStaat> {
  const factorId = formulier.get('factor');
  const code = normaliseerCode(formulier.get('code'));
  if (typeof factorId !== 'string' || factorId === '') return { fout: 'sessie' };
  if (!code) return { fout: 'code' };

  const supabase = await maakSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/inloggen');

  const uitdaging = await supabase.auth.mfa.challenge({ factorId });
  if (uitdaging.error) {
    console.error(`mfa-uitdaging mislukt: ${uitdaging.error.code ?? uitdaging.error.name}`);
    return { fout: uitdaging.error.status === TE_DRUK ? 'druk' : 'sessie' };
  }
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: uitdaging.data.id, code });
  if (error) {
    console.error(`mfa-code niet geaccepteerd bij instellen: ${error.code ?? error.name}`);
    return { fout: error.status === TE_DRUK ? 'druk' : 'code' };
  }
  // De wachtpagina kijkt zelf wat er nu geldt: wacht op bevestiging, direct door naar beheer, of (nog geen
  // beheerder) gewoon dit bericht.
  redirect('/mfa/wacht');
}
