// De Worker die online draait: de OpenNext-build voor alle aanvragen (fetch), plus de geplande taak (scheduled)
// die Cloudflare volgens "triggers" in wrangler.jsonc start (proefroute 3, docs/hosting.md).
//
// De taak is geen route: er is geen adres waarmee iemand hem van buiten kan starten.
//
// .open-next/worker.js bestaat pas na `npm run build:worker`; zijn type staat in open-next-worker.d.ts, zodat de
// typecontrole hier gewoon aan blijft (Fase-0-plan 1.3).

import openNext from './.open-next/worker.js';
import { maakDiensten, type ProefTaakOmgeving, voerProefTaakUit } from './src/taken/proef-taak.ts';

/** Wat Cloudflare aan een geplande run meegeeft (het deel dat hier nodig is). */
interface GeplandeRun {
  readonly scheduledTime: number;
}

const worker = {
  fetch: openNext.fetch,
  // Een fout gaat bewust door: dan staat de run bij Cloudflare als mislukt (Workers, Settings, Trigger Events).
  async scheduled(run: GeplandeRun, omgeving: ProefTaakOmgeving): Promise<void> {
    await voerProefTaakUit(
      new Date(run.scheduledTime),
      omgeving.PROEF_TAAK_FORCEER_FOUT === '1',
      maakDiensten(omgeving),
    );
  },
};

export default worker;
