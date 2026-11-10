import { describe, expect, it } from 'vitest';

import {
  aantalTeBevestigen,
  datumEnTijd,
  dagMaand,
  ingangTekst,
  isHandeling,
  leesBeheerders,
  maakBeheerdersoverzicht,
  meldingTekst,
  regelOnderNaam,
  vertaalBeheerderfout,
  volledigeNaam,
  type BeheerderRij,
} from './beheerders';

function rij(extra: Partial<BeheerderRij> = {}): BeheerderRij {
  return {
    lid_id: 'a',
    voornaam: 'Wil',
    achternaam: 'Coenen',
    status: 'beheerder',
    beheerder_sinds: '2026-10-29T10:00:00Z',
    app_id: null,
    app_naam: null,
    app_ingesteld: null,
    aantal_apps: 0,
    is_ik: false,
    ...extra,
  };
}

describe('volledigeNaam', () => {
  it('zet voornaam en achternaam achter elkaar', () => {
    expect(volledigeNaam('Wil', 'van Dijk')).toBe('Wil van Dijk');
  });
  it('laat een lege achternaam weg', () => {
    expect(volledigeNaam('Els', '')).toBe('Els');
  });
});

describe('leesBeheerders', () => {
  it('maakt van een rij een beheerder', () => {
    const [b] = leesBeheerders([rij({ lid_id: 'x', is_ik: true })]);
    expect(b).toMatchObject({ lidId: 'x', naam: 'Wil Coenen', status: 'beheerder', isIk: true });
  });
  it('weigert een status die niet bestaat', () => {
    expect(() => leesBeheerders([rij({ status: 'iets_anders' })])).toThrow();
  });
});

describe('maakBeheerdersoverzicht', () => {
  const lijst = leesBeheerders([
    rij({ lid_id: '1', voornaam: 'Mark', achternaam: 'Hendriks', is_ik: true }),
    rij({ lid_id: '2', voornaam: 'Ger', achternaam: 'Hermans' }),
    rij({ lid_id: '3', voornaam: 'Wil', achternaam: 'Coenen', status: 'wacht_op_bevestiging' }),
    rij({ lid_id: '4', voornaam: 'Piet', achternaam: 'Verhoeven', status: 'wacht_op_app' }),
  ]);

  it('zet wie bevestiging nodig heeft bij aandacht', () => {
    expect(maakBeheerdersoverzicht(lijst).aandacht.map((b) => b.lidId)).toEqual(['3']);
  });
  it('zet jezelf bovenaan bij de beheerders, daarna op naam, en wie op een app wacht erbij', () => {
    expect(maakBeheerdersoverzicht(lijst).beheerders.map((b) => b.lidId)).toEqual(['1', '2', '4']);
  });
  it('zet je eigen regel nooit bij aandacht, ook niet als je zelf op bevestiging wacht', () => {
    const eigen = leesBeheerders([rij({ lid_id: '9', status: 'wacht_op_bevestiging', is_ik: true })]);
    const overzicht = maakBeheerdersoverzicht(eigen);
    expect(overzicht.aandacht).toHaveLength(0);
    expect(overzicht.beheerders).toHaveLength(1);
  });
  it('telt de te bevestigen toegangen', () => {
    expect(aantalTeBevestigen(lijst)).toBe(1);
  });
});

describe('ingangTekst', () => {
  it('noemt de taak in woorden', () => {
    expect(ingangTekst(0)).toBe('Beheerders bekijken');
    expect(ingangTekst(1)).toBe('1 toegang bevestigen');
    expect(ingangTekst(3)).toBe('3 toegangen bevestigen');
  });
});

describe('datums', () => {
  it('zet een moment om naar de tijd van Nederland (winter, UTC+1)', () => {
    expect(datumEnTijd('2027-01-21T13:05:00Z')).toBe('21 januari 2027 om 14:05');
  });
  it('doet hetzelfde in de zomer (UTC+2)', () => {
    expect(datumEnTijd('2026-10-29T12:05:00Z')).toBe('29 oktober 2026 om 13:05');
  });
  it('geeft een dag en maand zonder jaar, op de dag van Nederland', () => {
    expect(dagMaand('2026-10-28T23:30:00Z')).toBe('29 oktober');
  });
});

describe('regelOnderNaam', () => {
  const [bevestigen] = leesBeheerders([
    rij({ status: 'wacht_op_bevestiging', app_ingesteld: '2027-01-21T13:05:00Z' }),
  ]);
  const [app] = leesBeheerders([rij({ status: 'wacht_op_app' })]);
  const [klaar] = leesBeheerders([rij()]);

  it('zegt per status wat er aan de hand is', () => {
    expect(regelOnderNaam(bevestigen!)).toBe(
      'Toegang bevestigen · app ingesteld op 21 januari 2027 om 14:05',
    );
    expect(regelOnderNaam(app!)).toBe('Moet nog een app instellen');
    expect(regelOnderNaam(klaar!)).toBe('Beheerder sinds 29 oktober');
  });
});

describe('vertaalBeheerderfout', () => {
  it.each([
    'lid_onbekend',
    'lid_geen_account',
    'al_beheerder',
    'geen_beheerder',
    'zelf',
    'niets_te_bevestigen',
    'app_onduidelijk',
    'app_gewijzigd',
  ])('heeft een eigen tekst voor %s', (code) => {
    expect(vertaalBeheerderfout(code)).not.toBe(vertaalBeheerderfout('onbekend'));
  });
  it('geeft bij een onbekende code een algemene tekst', () => {
    expect(vertaalBeheerderfout('')).toMatch(/niet gelukt/);
  });
  it('gebruikt geen voornaamwoord dat een geslacht aanneemt', () => {
    for (const code of ['lid_onbekend', 'app_onduidelijk', 'app_gewijzigd', 'zelf']) {
      expect(vertaalBeheerderfout(code)).not.toMatch(/\b(hij|hem|zijn|zij|haar)\b/i);
    }
  });
});

describe('meldingTekst', () => {
  it('noemt de naam en zegt wat er nu geldt, in de woorden van de knop', () => {
    expect(meldingTekst('toegevoegd', 'Piet').vet).toBe('Piet is beheerder gemaakt.');
    expect(meldingTekst('bevestigd', 'Wil').vet).toBe('De toegang van Wil is bevestigd.');
    expect(meldingTekst('ingetrokken', 'Hub').vet).toBe('Hub is geen beheerder meer.');
  });
  it('zegt bij beheerder maken dat er geen bericht uitgaat', () => {
    expect(meldingTekst('toegevoegd', 'Piet').vervolg).toMatch(/geen bericht/);
  });
  it('gebruikt geen voornaamwoord dat een geslacht aanneemt', () => {
    for (const h of ['toegevoegd', 'bevestigd', 'ingetrokken'] as const) {
      const t = meldingTekst(h, 'X');
      expect(`${t.vet} ${t.vervolg}`).not.toMatch(/\b(hij|hem|zijn|zij|haar)\b/i);
    }
  });
});

describe('isHandeling', () => {
  it('kent alleen de drie handelingen', () => {
    expect(isHandeling('toegevoegd')).toBe(true);
    expect(isHandeling('bevestigd')).toBe(true);
    expect(isHandeling('ingetrokken')).toBe(true);
    expect(isHandeling('verwijderd')).toBe(false);
    expect(isHandeling(undefined)).toBe(false);
  });
});
