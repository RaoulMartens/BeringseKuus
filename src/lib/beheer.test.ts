import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? bestanden(pad) : [pad];
  });
}

// Vergeten is niet onveilig (de database weigert, geen_admin), maar de gebruiker ziet dan een kale fout in plaats van
// het scherm dat bij zijn situatie hoort. Deze test houdt de afspraak uit CLAUDE.md overeind zodra er veel pagina's zijn.
describe('beheer controleert de toegang', () => {
  const map = join(process.cwd(), 'src/app/beheer');
  const alle = bestanden(map);

  it('elke pagina in beheer roept eisBeheer() aan', () => {
    const paginas = alle.filter((pad) => /page\.tsx$/.test(pad));
    expect(paginas.length).toBeGreaterThan(0);
    for (const pad of paginas) expect(readFileSync(pad, 'utf8'), pad).toContain('await eisBeheer()');
  });

  it('elke serveractie in beheer roept eisBeheer() aan', () => {
    for (const pad of alle.filter((p) => /acties\.ts$/.test(p))) {
      const tekst = readFileSync(pad, 'utf8');
      const acties = tekst.match(/export async function /g)?.length ?? 0;
      const controles = tekst.match(/await eisBeheer\(\)/g)?.length ?? 0;
      expect(controles, pad).toBeGreaterThanOrEqual(acties);
    }
  });

  it('beheer heeft een layout die eisBeheer() aanroept', () => {
    expect(readFileSync(join(map, 'layout.tsx'), 'utf8')).toContain('await eisBeheer()');
  });
});
