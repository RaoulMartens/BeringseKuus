import { describe, expect, it } from 'vitest';

import { bakNaarTekst, bakUitTekst, beginBak, groepeerBak, leesBak, plekkenVan, type BakPlek } from './bak';

const A = '0b0e0f0a-0000-4000-8000-000000000001';
const B = '0b0e0f0a-0000-4000-8000-000000000002';
const SLOT = '0b0e0f0a-0000-4000-8000-0000000000aa';

describe('beginBak', () => {
  it('begint met een plek voor prins, adjudant en vorst, en een plek voor elk lid van de Raad van Elf', () => {
    const plekken = beginBak([A, B]);
    expect(plekken.map((p) => p.label)).toEqual(['prins', 'adjudant', 'vorst', 'raadslid', 'raadslid']);
    expect(plekken.map((p) => p.bezetterId)).toEqual([null, null, null, A, B]);
    expect(plekken.every((p) => p.slotId === null && p.verwacht === null)).toBe(true);
  });

  it('heeft zonder raadsleden alleen de drie vaste plekken', () => {
    expect(beginBak([]).map((p) => p.label)).toEqual(['prins', 'adjudant', 'vorst']);
  });
});

describe('plekkenVan', () => {
  it('geeft de plekken van een kopje, in volgorde', () => {
    const plekken = beginBak([A]);
    expect(plekkenVan(plekken, ['prins', 'adjudant']).map((p) => p.label)).toEqual(['prins', 'adjudant']);
    expect(plekkenVan(plekken, ['raadslid']).map((p) => p.bezetterId)).toEqual([A]);
  });
});

describe('van het scherm naar de server en terug', () => {
  const plekken: BakPlek[] = [
    { slotId: SLOT, label: 'prins', bezetterId: A, verwacht: A },
    { slotId: null, label: 'raadslid', bezetterId: B, verwacht: null },
    { slotId: null, label: 'vorst', bezetterId: null, verwacht: null },
  ];

  it('stuurt bij een bak die uit staat alleen de schakelaar', () => {
    expect(JSON.parse(bakNaarTekst(false, plekken))).toEqual({ actief: false });
  });

  it('stuurt per plek het slot (als het bestaat), de plek, de bezetter en wie er verwacht werd', () => {
    expect(JSON.parse(bakNaarTekst(true, plekken))).toEqual({
      actief: true,
      plekken: [
        { slot_id: SLOT, label: 'prins', bezetter_id: A, verwachte_bezetter: A },
        { label: 'raadslid', bezetter_id: B, verwachte_bezetter: null },
        { label: 'vorst', bezetter_id: null, verwachte_bezetter: null },
      ],
    });
  });

  it('leest terug wat het scherm stuurde', () => {
    const tekst = bakNaarTekst(true, plekken);
    expect(bakUitTekst(tekst)).toEqual({ actief: true, plekken });
    expect(leesBak(tekst)).toEqual({
      actief: true,
      plekken: [
        { slot_id: SLOT, label: 'prins', bezetter_id: A, verwachte_bezetter: A },
        { label: 'raadslid', bezetter_id: B, verwachte_bezetter: null },
        { label: 'vorst', bezetter_id: null, verwachte_bezetter: null },
      ],
    });
  });

  it('geeft niets als het veld ontbreekt: de bak blijft zoals hij is', () => {
    expect(leesBak(null)).toBeNull();
    expect(leesBak('')).toBeNull();
    expect(bakUitTekst(null)).toBeNull();
  });

  it('wijst af wat het scherm niet kan maken', () => {
    expect(leesBak('geen json')).toBe('ongeldig');
    expect(leesBak('{"actief": "ja"}')).toBe('ongeldig');
    expect(leesBak('{"actief": true, "plekken": [{"label": "koning", "bezetter_id": null}]}')).toBe(
      'ongeldig',
    );
    expect(leesBak('{"actief": true, "plekken": [{"label": "vorst", "bezetter_id": "geen-uuid"}]}')).toBe(
      'ongeldig',
    );
    expect(leesBak('{"actief": true, "extra": 1}')).toBe('ongeldig');
    const teVeel = Array.from({ length: 31 }, () => ({ label: 'raadslid', bezetter_id: null }));
    expect(leesBak(JSON.stringify({ actief: true, plekken: teVeel }))).toBe('ongeldig');
  });

  it('een bak die aan staat zonder plekken is een bak zonder plekken', () => {
    expect(leesBak('{"actief": true}')).toEqual({ actief: true, plekken: [] });
  });
});

describe('groepeerBak (wat een lid ziet)', () => {
  const namen = [
    { label: 'adjudant' as const, lidId: 'l2', naam: 'Koen' },
    { label: 'raadslid' as const, lidId: 'l4', naam: 'Ton' },
    { label: 'prins' as const, lidId: 'l1', naam: 'Bram' },
    { label: 'raadslid' as const, lidId: 'l5', naam: 'Karin' },
  ];

  it('zet de kopjes in vaste volgorde, met prins voor adjudant, en laat lege kopjes weg', () => {
    const groepen = groepeerBak(namen, 'x');
    expect(groepen.map((g) => g.titel)).toEqual(['Prins en adjudant', 'Raad van Elf']);
    expect(groepen[0]?.namen.map((n) => n.naam)).toEqual(['Bram', 'Koen']);
    expect(groepen[1]?.namen.map((n) => n.naam)).toEqual(['Ton', 'Karin']);
  });

  it('herkent jezelf', () => {
    const groepen = groepeerBak(namen, 'l4');
    expect(groepen[1]?.namen.find((n) => n.lidId === 'l4')?.jij).toBe(true);
    expect(groepen[1]?.namen.find((n) => n.lidId === 'l5')?.jij).toBe(false);
  });

  it('geeft niets als er niemand in de bak zit', () => {
    expect(groepeerBak([], 'x')).toEqual([]);
  });
});
