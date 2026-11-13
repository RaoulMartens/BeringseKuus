import { describe, expect, it } from 'vitest';

import { initialen, maakRaster, type WieKomtErRij } from './wiekomter';

const rij = (id: string, voornaam: string, achternaam: string, komt: boolean): WieKomtErRij => ({
  lid_id: id,
  voornaam,
  achternaam,
  komt,
});

describe('initialen', () => {
  it('neemt de eerste letter van voor- en achternaam', () => {
    expect(initialen('Theo', 'Verstraten')).toBe('TV');
  });

  it('slaat een tussenvoegsel over', () => {
    expect(initialen('Ger', 'van Hout')).toBe('GH');
    expect(initialen('Jos', 'van der Berg')).toBe('JB');
  });

  it('maakt hoofdletters van kleine letters en houdt een accent heel', () => {
    expect(initialen('èlise', 'smeets')).toBe('ÈS');
  });

  it('valt terug op het eerste woord als alles klein is, en geeft niets terug zonder naam', () => {
    expect(initialen('Jan', 'van den')).toBe('JV');
    expect(initialen('', '')).toBe('');
  });
});

describe('maakRaster', () => {
  const rijen = [
    rij('1', 'Anne', 'Smeets', true),
    rij('2', 'Mark', 'Hendriks', true),
    rij('3', 'Bèr', 'Jacobs', false),
  ];

  it('telt wie komt en wie is afgemeld', () => {
    const raster = maakRaster(rijen, '2');
    expect(raster.aanwezig).toBe(2);
    expect(raster.afgemeld).toBe(1);
    expect(raster.leden).toHaveLength(3);
  });

  it('houdt de volgorde van de database aan', () => {
    expect(maakRaster(rijen, '2').leden.map((lid) => lid.lidId)).toEqual(['1', '2', '3']);
  });

  it('zet "(jij)" achter je eigen naam en nergens anders', () => {
    const raster = maakRaster(rijen, '2');
    expect(raster.leden.map((lid) => lid.naam)).toEqual(['Anne Smeets', 'Mark Hendriks (jij)', 'Bèr Jacobs']);
  });

  it('geeft een leeg raster zonder rijen', () => {
    expect(maakRaster([], '2')).toEqual({ leden: [], aanwezig: 0, afgemeld: 0 });
  });
});
