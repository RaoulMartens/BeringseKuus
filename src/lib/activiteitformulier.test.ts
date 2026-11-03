import { describe, expect, it } from 'vitest';

import {
  leesDetail,
  leesFormulier,
  leesWaarden,
  nogNodigOmTePubliceren,
  tijdstipVoorVeld,
  tijdVoorVeld,
  vertaalOpslagfout,
} from './activiteitformulier';

const UUID = '3f1b7a52-8c1e-4d1b-9a6e-0c2a5b9e7d41';
const ANDERE_UUID = '9d2c4e68-1a7b-4f3d-8e5c-6b0a1d2f3e45';

function formulier(velden: Record<string, string | string[]>): FormData {
  const uit = new FormData();
  for (const [sleutel, waarde] of Object.entries(velden)) {
    for (const deel of Array.isArray(waarde) ? waarde : [waarde]) uit.append(sleutel, deel);
  }
  return uit;
}

const MINIMAAL = { naam: 'Jeugdmiddag', datum: '2027-02-06' };

describe('leesFormulier: de velden', () => {
  it('neemt alleen een naam en een datum aan, de rest is leeg (opslaan als concept kan altijd, ook halfaf)', () => {
    const uit = leesFormulier(formulier(MINIMAAL));
    expect(uit).toEqual({
      ok: true,
      velden: {
        naam: 'Jeugdmiddag',
        datum: '2027-02-06',
        verzameltijd: null,
        starttijd: null,
        eindtijd: null,
        locatie: null,
        bus_vertrektijd: null,
        bus_locatie: null,
        notitie: null,
        afmeld_deadline: null,
        min_aanwezigen: null,
        groepen: [],
      },
      wijzigingen: [],
    });
  });

  it('leest alle velden, met spaties eraf en lege velden als null', () => {
    const uit = leesFormulier(
      formulier({
        naam: '  Bonte Avond ',
        datum: '2027-01-15',
        verzameltijd: '18:45',
        starttijd: '20:11',
        eindtijd: '01:11',
        locatie: ' De Kuus ',
        bus_vertrektijd: '19:15',
        bus_locatie: '   ',
        notitie: 'Neem je kostuum mee.',
        afmeld_deadline: '2027-01-10T20:00',
        min_aanwezigen: '13',
        groep: [UUID, ANDERE_UUID],
      }),
    );
    expect(uit.ok).toBe(true);
    if (!uit.ok) return;
    expect(uit.velden).toMatchObject({
      naam: 'Bonte Avond',
      locatie: 'De Kuus',
      bus_locatie: null,
      eindtijd: '01:11',
      afmeld_deadline: '2027-01-10T20:00',
      min_aanwezigen: 13,
      groepen: [UUID, ANDERE_UUID],
    });
  });

  it('laat het minimum leeg: dan staat het uit', () => {
    const uit = leesFormulier(formulier({ ...MINIMAAL, min_aanwezigen: '' }));
    expect(uit.ok && uit.velden.min_aanwezigen).toBeNull();
  });

  it('zegt per veld wat er niet klopt, in de woorden van het ontwerp', () => {
    const uit = leesFormulier(
      formulier({
        naam: '',
        datum: '',
        starttijd: '25:00',
        verzameltijd: '9',
        afmeld_deadline: 'morgen',
        min_aanwezigen: '0',
        groep: 'geen-uuid',
      }),
    );
    expect(uit).toEqual({
      ok: false,
      fouten: {
        naam: 'Vul een naam in.',
        datum: 'Vul een datum in.',
        starttijd: 'Vul een tijd in zoals 14:00.',
        verzameltijd: 'Vul een tijd in zoals 14:00.',
        afmeld_deadline: 'Vul een datum en tijd in.',
        min_aanwezigen: 'Vul een getal van 1 of meer in.',
        groepen: 'Kies een groep uit de lijst.',
      },
    });
  });

  it('weigert een datum die niet bestaat of buiten het bereik valt', () => {
    for (const datum of ['2027-02-30', '2027-13-01', '27-02-2027', '1999-12-31', '2101-01-01', 'vandaag']) {
      const uit = leesFormulier(formulier({ naam: 'X', datum }));
      expect(uit.ok, datum).toBe(false);
      if (!uit.ok) expect(uit.fouten.datum, datum).toBeTruthy();
    }
    expect(leesFormulier(formulier({ naam: 'X', datum: '2028-02-29' })).ok).toBe(true);
  });

  it('weigert een eindtijd gelijk aan de starttijd, maar laat een eindtijd na middernacht toe', () => {
    expect(leesFormulier(formulier({ ...MINIMAAL, starttijd: '20:00', eindtijd: '20:00' }))).toEqual({
      ok: false,
      fouten: { eindtijd: 'De eindtijd kan niet gelijk zijn aan de starttijd.' },
    });
    expect(leesFormulier(formulier({ ...MINIMAAL, starttijd: '20:11', eindtijd: '01:11' })).ok).toBe(true);
  });

  it('begrenst de lengte van de tekstvelden', () => {
    expect(leesFormulier(formulier({ naam: 'x'.repeat(201), datum: '2027-02-06' })).ok).toBe(false);
    expect(leesFormulier(formulier({ naam: 'x'.repeat(200), datum: '2027-02-06' })).ok).toBe(true);
    expect(leesFormulier(formulier({ ...MINIMAAL, notitie: 'x'.repeat(2001) })).ok).toBe(false);
  });

  it('weigert een minimum dat geen heel getal is', () => {
    for (const waarde of ['abc', '1.5', '-2', '1000000']) {
      expect(leesFormulier(formulier({ ...MINIMAAL, min_aanwezigen: waarde })).ok, waarde).toBe(false);
    }
  });
});

describe('leesFormulier: de plekken', () => {
  it('maakt van de formulierwaarden de handelingen voor activiteit_opslaan', () => {
    const uit = leesFormulier(
      formulier({
        ...MINIMAAL,
        plek_toevoegen: ['werker:n1', 'drankhaler:n2'],
        plek_weghalen: [UUID],
      }),
    );
    expect(uit.ok && uit.wijzigingen).toEqual([
      { handeling: 'plek_toevoegen', rol_type: 'werker', tijdelijk_id: 'n1' },
      { handeling: 'plek_toevoegen', rol_type: 'drankhaler', tijdelijk_id: 'n2' },
      { handeling: 'plek_weghalen', rol_slot_id: UUID },
    ]);
  });

  it('weigert een rol die de beheerder niet zelf toevoegt, een dubbele naam en een id dat geen uuid is', () => {
    const fout: Record<string, string | string[]>[] = [
      { plek_toevoegen: 'eindverantwoordelijke:n1' },
      { plek_toevoegen: 'bak:n1' },
      { plek_toevoegen: 'werker' },
      { plek_toevoegen: ['werker:n1', 'bob:n1'] },
      { plek_toevoegen: 'werker:%%%' },
      { plek_weghalen: 'niet-een-uuid' },
    ];
    for (const velden of fout) {
      const uit = leesFormulier(formulier({ ...MINIMAAL, ...velden }));
      expect(uit.ok, JSON.stringify(velden)).toBe(false);
      if (!uit.ok) expect(uit.fouten.plekken, JSON.stringify(velden)).toBeTruthy();
    }
  });
});

describe('vertaalOpslagfout', () => {
  it('zet een ontbrekend veld bij dat veld', () => {
    expect(vertaalOpslagfout('veld_ontbreekt', { velden: ['naam', 'eindtijd'] })).toEqual({
      fouten: { naam: 'Vul een naam in.', eindtijd: 'Vul een eindtijd in.' },
      melding: null,
    });
  });

  it('zet een ongeldig veld bij dat veld, en kent de eindtijd', () => {
    expect(vertaalOpslagfout('veld_ongeldig', { veld: 'notitie' }).fouten).toEqual({
      notitie: 'Dit klopt niet. Controleer wat je hebt ingevuld.',
    });
    expect(vertaalOpslagfout('veld_ongeldig', { veld: 'eindtijd' }).fouten.eindtijd).toContain(
      'gelijk zijn aan de starttijd',
    );
  });

  it('geeft bij een fout zonder veld een melding bovenaan, ook bij een gek detail', () => {
    for (const detail of [{}, null, 'tekst', { veld: 'velden' }, { veld: 'verwachte_versie' }]) {
      expect(vertaalOpslagfout('veld_ongeldig', detail).melding, JSON.stringify(detail)).toContain(
        'niet gelukt',
      );
    }
    expect(vertaalOpslagfout('veld_ontbreekt', { velden: ['onbekend'] }).melding).toContain('niet gelukt');
  });

  it('zegt dat een ander net heeft opgeslagen als de versie verouderd is', () => {
    const uit = vertaalOpslagfout('versie_verouderd', { versie: 4 });
    expect(uit.melding).toContain('Iemand anders heeft deze activiteit net gewijzigd');
    expect(uit.melding).toContain('niet opgeslagen');
  });

  it('kent de overige codes en geeft bij een onbekende code de algemene tekst', () => {
    expect(vertaalOpslagfout('activiteit_onbekend', {}).melding).toBe('Deze activiteit bestaat niet meer.');
    expect(vertaalOpslagfout('activiteit_niet_open', {}).melding).toContain('niet meer open');
    expect(vertaalOpslagfout('groep_onbekend', {}).fouten.groepen).toContain('bestaat niet meer');
    expect(vertaalOpslagfout('plek_niet_leeg', {}).melding).toContain('inmiddels gewijzigd');
    expect(vertaalOpslagfout('iets_nieuws', {}).melding).toContain('niet gelukt');
  });
});

describe('leesDetail', () => {
  it('leest de JSON van de database en is veilig voor alles anders', () => {
    expect(leesDetail('{"veld": "naam"}')).toEqual({ veld: 'naam' });
    expect(leesDetail('geen json')).toEqual({});
    expect(leesDetail(undefined)).toEqual({});
    expect(leesDetail(5)).toEqual({});
  });
});

describe('tijdVoorVeld en tijdstipVoorVeld', () => {
  it('kort een tijd af en kent een lege tijd', () => {
    expect(tijdVoorVeld('14:00:00')).toBe('14:00');
    expect(tijdVoorVeld('09:05')).toBe('09:05');
    expect(tijdVoorVeld(null)).toBe('');
  });

  it('geeft een tijdstip in Amsterdamse tijd, in de winter en in de zomer', () => {
    expect(tijdstipVoorVeld('2027-02-01T19:00:00+00:00')).toBe('2027-02-01T20:00');
    expect(tijdstipVoorVeld('2027-07-01T18:00:00+00:00')).toBe('2027-07-01T20:00');
    // Net na middernacht in Nederland is het nog de vorige dag in UTC.
    expect(tijdstipVoorVeld('2027-01-21T23:30:00Z')).toBe('2027-01-22T00:30');
    expect(tijdstipVoorVeld(null)).toBe('');
    expect(tijdstipVoorVeld('geen tijdstip')).toBe('');
  });
});

describe('nogNodigOmTePubliceren', () => {
  const compleet = {
    starttijd: '20:00',
    eindtijd: '23:00',
    locatie: 'De Kuus',
    heeftEindverantwoordelijke: true,
    eindverantwoordelijkeHeeftTelefoon: true,
  };

  it('is leeg als alles er is', () => {
    expect(nogNodigOmTePubliceren(compleet)).toEqual([]);
  });

  it('noemt wat ontbreekt, in de volgorde van het scherm', () => {
    expect(
      nogNodigOmTePubliceren({
        starttijd: null,
        eindtijd: null,
        locatie: null,
        heeftEindverantwoordelijke: false,
        eindverantwoordelijkeHeeftTelefoon: false,
      }),
    ).toEqual(['Starttijd', 'Eindtijd', 'Locatie', 'Eindverantwoordelijke']);
  });

  it('vraagt om een telefoonnummer als de eindverantwoordelijke er is maar geen nummer heeft', () => {
    expect(nogNodigOmTePubliceren({ ...compleet, eindverantwoordelijkeHeeftTelefoon: false })).toEqual([
      'Telefoonnummer van de eindverantwoordelijke',
    ]);
  });
});

describe('leesWaarden', () => {
  it('geeft terug wat er was ingevuld, ook als het niet klopt', () => {
    const waarden = leesWaarden(
      formulier({
        naam: 'Fout',
        datum: 'morgen',
        groep: [UUID],
        plek_toevoegen: 'werker:n1',
        plek_weghalen: ANDERE_UUID,
      }),
    );
    expect(waarden.tekst.naam).toBe('Fout');
    expect(waarden.tekst.datum).toBe('morgen');
    expect(waarden.tekst.locatie).toBe('');
    expect(waarden.groepen).toEqual([UUID]);
    expect(waarden.plekToevoegen).toEqual(['werker:n1']);
    expect(waarden.plekWeghalen).toEqual([ANDERE_UUID]);
  });
});
