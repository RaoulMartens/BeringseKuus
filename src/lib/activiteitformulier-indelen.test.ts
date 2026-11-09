import { describe, expect, it } from 'vitest';

import { leesFormulier, vertaalOpslagfout } from './activiteitformulier';

const SLOT = '5b8e2a10-3c4d-4e6f-8a9b-1c2d3e4f5a6b';
const ANDER_SLOT = '7c9f3b21-4d5e-4f70-9bac-2d3e4f5a6b7c';
const LID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const OUD_LID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

const MINIMAAL = { naam: 'Jeugdmiddag', datum: '2027-02-06' };

function plekken(extra: Record<string, string | string[]>): ReturnType<typeof leesFormulier> {
  const formulier = new FormData();
  for (const [sleutel, waarde] of Object.entries({ ...MINIMAAL, ...extra })) {
    const delen: string[] = typeof waarde === 'string' ? [waarde] : waarde;
    for (const deel of delen) formulier.append(sleutel, deel);
  }
  return leesFormulier(formulier);
}

describe('leesFormulier: indelen', () => {
  it('deelt iemand in op een lege plek, met niemand als verwachte bezetter', () => {
    const uit = plekken({ [`plek_${SLOT}`]: LID, [`plek_was_${SLOT}`]: '' });
    expect(uit.ok && uit.wijzigingen).toEqual([
      { handeling: 'toewijzen', rol_slot_id: SLOT, lid_id: LID, verwachte_bezetter: null },
    ]);
  });

  it('vervangt iemand en geeft mee wie er stond (UC-005 AF-8)', () => {
    const uit = plekken({ [`plek_${SLOT}`]: LID, [`plek_was_${SLOT}`]: OUD_LID });
    expect(uit.ok && uit.wijzigingen).toEqual([
      { handeling: 'toewijzen', rol_slot_id: SLOT, lid_id: LID, verwachte_bezetter: OUD_LID },
    ]);
  });

  it('doet niets als de keuze gelijk is aan wie er stond, of als een lege plek leeg blijft', () => {
    const uit = plekken({
      [`plek_${SLOT}`]: LID,
      [`plek_was_${SLOT}`]: LID,
      [`plek_${ANDER_SLOT}`]: '',
      [`plek_was_${ANDER_SLOT}`]: '',
    });
    expect(uit.ok && uit.wijzigingen).toEqual([]);
  });

  it('maakt een plek leeg, en bij "plek weghalen" ook weg, in die volgorde', () => {
    const leeg = plekken({ [`plek_${SLOT}`]: '__leeg', [`plek_was_${SLOT}`]: OUD_LID });
    expect(leeg.ok && leeg.wijzigingen).toEqual([
      { handeling: 'leegmaken', rol_slot_id: SLOT, verwachte_bezetter: OUD_LID },
    ]);
    const weg = plekken({ [`plek_${SLOT}`]: '__weg', [`plek_was_${SLOT}`]: OUD_LID });
    expect(weg.ok && weg.wijzigingen).toEqual([
      { handeling: 'leegmaken', rol_slot_id: SLOT, verwachte_bezetter: OUD_LID },
      { handeling: 'plek_weghalen', rol_slot_id: SLOT },
    ]);
  });

  it('haalt een lege plek weg zonder eerst leeg te maken, en nooit twee keer', () => {
    const uit = plekken({
      [`plek_${SLOT}`]: '__weg',
      [`plek_was_${SLOT}`]: '',
      plek_weghalen: SLOT,
    });
    expect(uit.ok && uit.wijzigingen).toEqual([{ handeling: 'plek_weghalen', rol_slot_id: SLOT }]);
  });

  it('deelt iemand in op een plek die in dezelfde keer is toegevoegd, en op de eindverantwoordelijke van een nieuwe activiteit', () => {
    const uit = plekken({
      plek_toevoegen: 'werker:n1',
      plek_nieuw_n1: LID,
      plek_eindverantwoordelijke: OUD_LID,
    });
    expect(uit.ok && uit.wijzigingen).toEqual([
      { handeling: 'plek_toevoegen', rol_type: 'werker', tijdelijk_id: 'n1' },
      { handeling: 'toewijzen', tijdelijk_id: 'n1', lid_id: LID, verwachte_bezetter: null },
      {
        handeling: 'toewijzen',
        tijdelijk_id: 'eindverantwoordelijke',
        lid_id: OUD_LID,
        verwachte_bezetter: null,
      },
    ]);
  });

  it('laat een nieuwe plek zonder keuze leeg', () => {
    const uit = plekken({ plek_toevoegen: 'werker:n1', plek_nieuw_n1: '' });
    expect(uit.ok && uit.wijzigingen).toEqual([
      { handeling: 'plek_toevoegen', rol_type: 'werker', tijdelijk_id: 'n1' },
    ]);
  });

  it('zet de handelingen in een volgorde die klopt: toevoegen, leegmaken, weghalen, indelen', () => {
    const uit = plekken({
      plek_toevoegen: 'bob:n1',
      plek_nieuw_n1: LID,
      [`plek_${SLOT}`]: '__weg',
      [`plek_was_${SLOT}`]: OUD_LID,
      [`plek_${ANDER_SLOT}`]: LID,
      [`plek_was_${ANDER_SLOT}`]: '',
    });
    expect(uit.ok && uit.wijzigingen.map((w) => w.handeling)).toEqual([
      'plek_toevoegen',
      'leegmaken',
      'plek_weghalen',
      'toewijzen',
      'toewijzen',
    ]);
  });

  it('weigert wat niet van ons formulier komt', () => {
    const fout: Record<string, string>[] = [
      { [`plek_${SLOT}`]: 'geen-uuid', [`plek_was_${SLOT}`]: '' },
      { [`plek_${SLOT}`]: LID }, // zonder plek_was
      { [`plek_${SLOT}`]: '', [`plek_was_${SLOT}`]: OUD_LID }, // een bezette plek zonder keuze
      { plek_nieuw_n9: LID }, // een nieuwe plek die niet is toegevoegd
      { plek_eindverantwoordelijke: 'geen-uuid' },
    ];
    for (const velden of fout) {
      const uit = plekken(velden);
      expect(uit.ok, JSON.stringify(velden)).toBe(false);
      if (!uit.ok) expect(uit.fouten.plekken, JSON.stringify(velden)).toBeTruthy();
    }
  });
});

describe('vertaalOpslagfout: indelen', () => {
  it('zet de fouten van het indelen bij de plekken of de groep', () => {
    expect(vertaalOpslagfout('lid_buiten_doelgroep', {}).fouten.plekken).toContain('hoort niet bij de groep');
    expect(vertaalOpslagfout('doelgroep_conflict', {}).fouten.groepen).toContain(
      'Haal ze eerst van hun plek',
    );
    expect(vertaalOpslagfout('lid_inactief', {}).fouten.plekken).toContain('geen actief lid');
    expect(vertaalOpslagfout('lid_afgemeld', {}).fouten.plekken).toContain('afgemeld');
    expect(vertaalOpslagfout('extern_niet_toegestaan', {}).fouten.plekken).toContain(
      'geen eindverantwoordelijke',
    );
    expect(vertaalOpslagfout('dubbelboeking', {}).fouten.plekken).toContain('twee plekken');
    expect(vertaalOpslagfout('eindverantwoordelijke_verplicht', {}).fouten.plekken).toContain(
      'eindverantwoordelijke',
    );
  });

  it('zegt bij een eindverantwoordelijke zonder telefoonnummer dat leden hem moeten kunnen bellen', () => {
    expect(vertaalOpslagfout('eindverantwoordelijke_verplicht', { reden: 'telefoon' }).fouten.plekken).toBe(
      'De eindverantwoordelijke heeft geen telefoonnummer, en leden moeten hem kunnen bellen. Kies iemand met een telefoonnummer, of vraag de bouwer van het platform het nummer in de ledenlijst te zetten.',
    );
    expect(vertaalOpslagfout('eindverantwoordelijke_verplicht', { reden: 'leeg' }).fouten.plekken).toContain(
      'kan niet worden weggehaald',
    );
  });

  it('zegt bij een gewijzigde plek dat er niets is opgeslagen', () => {
    const uit = vertaalOpslagfout('slot_gewijzigd', { rol_slot_id: 'x' });
    expect(uit.melding).toContain('Deze plek is inmiddels gewijzigd');
    expect(uit.melding).toContain('niet opgeslagen');
  });
});

describe('leesFormulier: de nieuwe rollen en iemand van buiten de vereniging', () => {
  it('stuurt een rol uit de lijst als rol_type; een rol die er niet uit komt (geen "Anders") weigert hij', () => {
    const uit = plekken({ plek_toevoegen: ['tapper:n1', 'bonnenkassa:n2'] });
    expect(uit.ok && uit.wijzigingen).toEqual([
      { handeling: 'plek_toevoegen', rol_type: 'tapper', tijdelijk_id: 'n1' },
      { handeling: 'plek_toevoegen', rol_type: 'bonnenkassa', tijdelijk_id: 'n2' },
    ]);
    for (const waarde of ['Garderobe:n1', 'bar boven:n1', 'tapper:n1:x']) {
      expect(plekken({ plek_toevoegen: waarde }).ok, waarde).toBe(false);
    }
  });

  it('zet iemand van buiten op een nieuwe plek met alleen een naam, zonder dubbele spaties', () => {
    const uit = plekken({
      plek_toevoegen: 'tapper:n1',
      plek_nieuw_n1: '__helper',
      helper_naam__plek_nieuw_n1: '  Kees   van Buuren ',
    });
    expect(uit.ok && uit.wijzigingen).toEqual([
      { handeling: 'plek_toevoegen', rol_type: 'tapper', tijdelijk_id: 'n1' },
      {
        handeling: 'toewijzen',
        tijdelijk_id: 'n1',
        nieuwe_helper: 'Kees van Buuren',
        verwachte_bezetter: null,
      },
    ]);
  });

  it('zet iemand van buiten op een bestaande plek en geeft mee wie er stond', () => {
    const uit = plekken({
      [`plek_${SLOT}`]: '__helper',
      [`plek_was_${SLOT}`]: OUD_LID,
      [`helper_naam__plek_${SLOT}`]: 'Kees',
    });
    expect(uit.ok && uit.wijzigingen).toEqual([
      { handeling: 'toewijzen', rol_slot_id: SLOT, nieuwe_helper: 'Kees', verwachte_bezetter: OUD_LID },
    ]);
  });

  it('weigert een lege of te lange naam, en iemand van buiten als eindverantwoordelijke', () => {
    for (const naam of ['', '   ', 'x'.repeat(101)]) {
      const uit = plekken({
        plek_toevoegen: 'tapper:n1',
        plek_nieuw_n1: '__helper',
        helper_naam__plek_nieuw_n1: naam,
      });
      expect(uit.ok, JSON.stringify(naam)).toBe(false);
      if (!uit.ok) expect(uit.fouten.plekken).toContain('Vul de naam in');
    }
    expect(plekken({ plek_eindverantwoordelijke: '__helper' }).ok).toBe(false);
  });

  it('zet een fout in de naam bij de plekken', () => {
    expect(vertaalOpslagfout('veld_ongeldig', { veld: 'helper_naam' }).fouten.plekken).toContain(
      'Vul de naam in',
    );
  });
});
