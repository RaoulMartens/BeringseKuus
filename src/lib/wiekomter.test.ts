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
    expect(initialen('Rik', 'van Rijn')).toBe('RR');
    expect(initialen('Piet', 'de Graaf')).toBe('PG');
  });

  it('slaat een tussenvoegsel ook over met een hoofdletter, zoals het soms is ingevoerd', () => {
    expect(initialen('Piet', 'Van Test')).toBe('PT');
    expect(initialen('Anna', 'Van der Voorbeeld')).toBe('AV');
    expect(initialen('Anne', 'De Wit')).toBe('AW');
    expect(initialen('Jan', 'VAN DEN BERG')).toBe('JB');
  });

  it('kent tussenvoegsels die aan de naam vastzitten', () => {
    expect(initialen('Jan', "d'Hondt")).toBe('JH');
    expect(initialen('Jan', "'t Hart")).toBe('JH');
    expect(initialen('Jan', "van 't Hoff")).toBe('JH');
    expect(initialen('Jan', "'s-Gravesande")).toBe('JG');
  });

  it('telt IJ als één letter', () => {
    expect(initialen('Ruud', 'IJsselstein')).toBe('RIJ');
    expect(initialen('Ijsbrand', 'de Vries')).toBe('IJV');
  });

  it('neemt het eerste deel van een dubbele achternaam', () => {
    expect(initialen('Els', 'Jansen-Pieters')).toBe('EJ');
  });

  it('houdt een accent heel en maakt hoofdletters van kleine letters', () => {
    expect(initialen('èlise', 'smeets')).toBe('ÈS');
  });

  it('valt terug op het eerste woord als de hele achternaam een tussenvoegsel lijkt, en geeft niets terug zonder naam', () => {
    expect(initialen('Jan', 'van den')).toBe('JV');
    expect(initialen('', '')).toBe('');
  });

  it('slaat de toevoeging van een beheeraccount over', () => {
    expect(initialen('Piet', 'Voorbeeld (beheer)')).toBe('PV');
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
