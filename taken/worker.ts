// De taken-Worker (ledenplatform-taken): alleen geplande taken, zonder de Next-app (Bouwbesluiten 3.1, review
// PR12-01). Alleen deze Worker krijgt de geheime sleutel van Supabase en de Resend-gegevens. In één Worker met de
// app zou de hele app die sleutel via process.env kunnen lezen, en die sleutel gaat om alle rechten heen.
//
// Geen fetch: deze Worker heeft geen adres (workers_dev staat uit in taken/wrangler.jsonc). Cloudflare start hem
// volgens de triggers. Geen pakketten, alleen eigen bestanden: de uitrolstap bundelt zonder installatie.

import { maakDiensten, type ProefTaakOmgeving, voerProefTaakUit } from '../src/taken/proef-taak.ts';

/** Wat Cloudflare aan een geplande run meegeeft (het deel dat hier nodig is). */
interface GeplandeRun {
  readonly scheduledTime: number;
}

const takenWorker = {
  // Een fout gaat bewust door: dan staat de run bij Cloudflare als mislukt (Workers, ledenplatform-taken, Settings,
  // Trigger Events, View events), en de reden in Workers Logs.
  async scheduled(run: GeplandeRun, omgeving: ProefTaakOmgeving): Promise<void> {
    const diensten = maakDiensten(omgeving);
    if (!diensten) {
      // Nog niet ingesteld (de geheimen ontbreken): geen fout elke minuut, wel een regel in de logs (review PR12-04).
      console.warn('proeftaak: niet ingesteld (SUPABASE_URL of SUPABASE_SECRET_KEY ontbreekt); niets gedaan');
      return;
    }
    await voerProefTaakUit(new Date(run.scheduledTime), omgeving.PROEF_TAAK_FORCEER_FOUT === '1', diensten);
  },
};

export default takenWorker;
