import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { dienstRegel, ingelogdTekst, uitnodigingTekst } from '@/lib/leden';
import { korteDatum } from '@/lib/programma';
import { maakSupabase } from '@/lib/supabase/server';

import { leesLidBeheer, leesUitnodigingen } from '../gegevens';
import stijl from '../leden.module.css';
import { Lidformulier, Lidpaneel, Lidscherm } from './lidstaat';

export const metadata: Metadata = { title: 'Lid – Ledenplatform' };

/**
 * Een lid (wireframe admin-lid): wat je niet wijzigt (het e-mailadres is waarmee het lid inlogt), en wat wel: telefoon, groepen en bijzondere
 * rollen. Wijzigingen gaan door bij Opslaan, alles tegelijk of niets (lid_opslaan). Een inactief lid heeft geen formulier: de enige handeling is
 * weer actief maken, op een eigen pagina.
 */
export default async function LidPagina({ params }: { params: Promise<{ lidId: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).lidId);
  if (!id.success) notFound();

  const lid = await leesLidBeheer(await maakSupabase(), id.data);
  if (!lid) notFound();
  if (!lid.actief) redirect(`/beheer/leden/${lid.lidId}/actief`);

  const nogNietIngelogd = lid.laatstIngelogd === null;
  const uitnodiging = nogNietIngelogd
    ? uitnodigingTekst((await leesUitnodigingen(await maakSupabase())).get(lid.lidId))
    : null;
  const kanInactief = !lid.isBeheerder && !lid.isIk;
  const reden = lid.isIk
    ? 'Jezelf zet je niet op inactief.'
    : lid.isBeheerder
      ? 'Een beheerder zet je niet op inactief. Trek eerst de rechten in bij Beheerders.'
      : undefined;

  return (
    <Lidscherm
      begin={{
        telefoon: lid.telefoon ?? '',
        groepen: lid.groepen.filter((g) => g.gekozen).map((g) => g.id),
        aanmerkingen: [
          ...(lid.magBob ? ['bob'] : []),
          ...(lid.magEindverantwoordelijke ? ['eindverantwoordelijke'] : []),
        ],
      }}
    >
      <Schermkader
        actief="beheer"
        titel={lid.naam}
        terug={{ href: '/beheer/leden', tekst: 'Terug naar leden' }}
        zijkolom={
          <>
            <Kaart titel="Komende diensten" label lijst={lid.diensten.length > 0}>
              {lid.diensten.length === 0 ? (
                <p className={stijl.leeg}>Geen komende diensten.</p>
              ) : (
                <Lijst>
                  {lid.diensten.map((d) => (
                    <Lijstrij
                      key={`${d.activiteitId}-${d.rol}`}
                      href={`/beheer/activiteiten/${d.activiteitId}`}
                    >
                      <span className={stijl.tekst}>
                        <strong className={stijl.naam}>{d.naam}</strong>
                        <span className={stijl.onder}>
                          {korteDatum(d.datum)} · {dienstRegel(d)}
                        </span>
                      </span>
                    </Lijstrij>
                  ))}
                </Lijst>
              )}
            </Kaart>
            <Lidpaneel lidId={lid.lidId} kanInactief={kanInactief} reden={reden} />
          </>
        }
      >
        <Kaart titel="Gegevens" label>
          <dl className={stijl.gegevens}>
            <div>
              <dt>E-mailadres</dt>
              <dd>{lid.email}</dd>
            </div>
            <div>
              <dt>Ingelogd</dt>
              <dd>{ingelogdTekst(lid.laatstIngelogd)}</dd>
            </div>
            {uitnodiging && (
              <div>
                <dt>Uitnodiging</dt>
                <dd>{uitnodiging}</dd>
              </div>
            )}
          </dl>
          {nogNietIngelogd && (
            <div className={stijl.knoppen}>
              <Knop href={`/beheer/leden/${lid.lidId}/uitnodigen`} soort="tekst">
                Uitnodiging opnieuw sturen
              </Knop>
              <Knop href={`/beheer/leden/${lid.lidId}/adres`} soort="tekst">
                E-mailadres corrigeren
              </Knop>
            </div>
          )}
          <p className={stijl.hulp}>
            {nogNietIngelogd
              ? `Zolang ${lid.voornaam} nog nooit is ingelogd kun je het e-mailadres corrigeren, bijvoorbeeld bij een typfout. Daarna niet meer: dat is waarmee ${lid.voornaam} inlogt.`
              : `Het e-mailadres kun je hier niet wijzigen: dat is waarmee ${lid.voornaam} inlogt.`}
          </p>
        </Kaart>
        <Lidformulier
          lidId={lid.lidId}
          voornaam={lid.voornaam}
          groepen={lid.groepen.map((g) => ({ id: g.id, naam: g.naam, aantal: g.aantal }))}
        />
      </Schermkader>
    </Lidscherm>
  );
}
