import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { leesXlsx, MAX_BESTAND, XlsxFout, type XlsxFoutCode } from './xlsx';

// ===== Een zip bouwen om mee te testen =====
// Alleen wat een lezer nodig heeft: lokale koppen, een centrale map en het eindrecord. CRC wordt niet gecontroleerd (de lezer
// vertrouwt op de lengte), dus staat er 0.

interface Deel {
  naam: string;
  inhoud: string | Uint8Array;
  methode?: 0 | 8;
  /** Een grootte die niet klopt met wat er echt in zit, voor de zip-bom. */
  loggrootte?: number;
  versleuteld?: boolean;
}

function maakZip(delen: Deel[]): Uint8Array {
  const enc = new TextEncoder();
  const stukken: Uint8Array[] = [];
  const centraal: Uint8Array[] = [];
  let offset = 0;
  for (const deel of delen) {
    const naam = enc.encode(deel.naam);
    const ruw = typeof deel.inhoud === 'string' ? enc.encode(deel.inhoud) : deel.inhoud;
    const methode = deel.methode ?? 8;
    const data = methode === 8 ? new Uint8Array(deflateRawSync(ruw)) : ruw;
    const grootte = deel.loggrootte ?? ruw.length;
    const vlaggen = deel.versleuteld ? 1 : 0;

    const lokaal = new Uint8Array(30 + naam.length);
    const l = new DataView(lokaal.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, vlaggen, true);
    l.setUint16(8, methode, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, grootte, true);
    l.setUint16(26, naam.length, true);
    lokaal.set(naam, 30);

    const kop = new Uint8Array(46 + naam.length);
    const c = new DataView(kop.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, vlaggen, true);
    c.setUint16(10, methode, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, grootte, true);
    c.setUint16(28, naam.length, true);
    c.setUint32(42, offset, true);
    kop.set(naam, 46);

    stukken.push(lokaal, data);
    centraal.push(kop);
    offset += lokaal.length + data.length;
  }
  const mapGrootte = centraal.reduce((som, k) => som + k.length, 0);
  const eind = new Uint8Array(22);
  const e = new DataView(eind.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, delen.length, true);
  e.setUint16(10, delen.length, true);
  e.setUint32(12, mapGrootte, true);
  e.setUint32(16, offset, true);
  const alles = [...stukken, ...centraal, eind];
  const uit = new Uint8Array(alles.reduce((som, s) => som + s.length, 0));
  let pos = 0;
  for (const s of alles) {
    uit.set(s, pos);
    pos += s.length;
  }
  return uit;
}

const TYPES =
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';
const WERKBOEK =
  '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Activiteiten" sheetId="1" r:id="rId1"/></sheets></workbook>';
const RELATIES =
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>';

function bestand(blad: string, extra: Deel[] = [], gedeeld?: string): Uint8Array {
  const delen: Deel[] = [
    { naam: '[Content_Types].xml', inhoud: TYPES },
    { naam: 'xl/workbook.xml', inhoud: WERKBOEK },
    { naam: 'xl/_rels/workbook.xml.rels', inhoud: RELATIES },
    {
      naam: 'xl/worksheets/sheet1.xml',
      inhoud: `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${blad}</sheetData></worksheet>`,
    },
    ...extra,
  ];
  if (gedeeld !== undefined) delen.push({ naam: 'xl/sharedStrings.xml', inhoud: gedeeld });
  return maakZip(delen);
}

async function fout(bytes: Uint8Array): Promise<XlsxFoutCode | 'geen fout'> {
  try {
    await leesXlsx(bytes);
    return 'geen fout';
  } catch (e) {
    if (e instanceof XlsxFout) return e.code;
    throw e;
  }
}

describe('leesXlsx', () => {
  it('leest het sjabloon van de vereniging', async () => {
    const rijen = await leesXlsx(new Uint8Array(readFileSync('public/activiteiten-sjabloon.xlsx')));
    expect(rijen[0]).toEqual([
      'naam',
      'datum',
      'verzameltijd',
      'starttijd',
      'eindtijd',
      'locatie',
      'busvertrek',
      'notitie',
      'voor_wie',
    ]);
    // Twee voorbeeldregels; een lege cel (voor_wie, busvertrek) is null.
    expect(rijen).toHaveLength(3);
    expect(rijen[1]?.[0]).toBe('Voorbeeld: Bonte Avond');
    expect(rijen[1]?.[1]).toBe('11-02-2028');
    expect(rijen[1]?.[6]).toBeNull();
  });

  it('leest gedeelde tekst, getallen (een datum als serienummer), en zet cellen op hun kolom', async () => {
    const gedeeld =
      '<sst><si><t>naam</t></si><si><t>datum</t></si><si><t>Bonte Avond</t></si><si><r><t>Rijke </t></r><r><t>tekst</t></r></si></sst>';
    const blad =
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="3"><v>46395</v></c><c r="D2" t="s"><v>3</v></c></row>';
    const rijen = await leesXlsx(bestand(blad, [], gedeeld));
    expect(rijen[0]).toEqual(['naam', 'datum']);
    // C2 is niet ingevuld: een gat, null; D2 staat op kolom 3.
    expect(rijen[1]).toEqual(['Bonte Avond', 46395, null, 'Rijke tekst']);
  });

  it('leest tekst uit een formule als de waarde die Excel bewaarde, en voert niets uit', async () => {
    const blad =
      '<row r="1"><c r="A1" t="str"><f>CONCATENATE("a","b")</f><v>ab</v></c><c r="B1"><f>1+1</f><v>2</v></c></row>';
    expect((await leesXlsx(bestand(blad)))[0]).toEqual(['ab', 2]);
  });

  it('zet de tekens van XML terug', async () => {
    const blad =
      '<row r="1"><c r="A1" t="inlineStr"><is><t>P&amp;M &lt;feest&gt; &#233;n &#x41;</t></is></c></row>';
    expect((await leesXlsx(bestand(blad)))[0]).toEqual(['P&M <feest> én A']);
  });

  it('houdt rijen op hun plek, ook met een lege rij ertussen', async () => {
    const blad =
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>c</t></is></c></row>';
    const rijen = await leesXlsx(bestand(blad));
    expect(rijen).toHaveLength(3);
    expect(rijen[1]).toEqual([]);
    expect(rijen[2]).toEqual(['c']);
  });

  it('leest het eerste tabblad van het werkboek, niet het eerste bestand', async () => {
    const werkboek =
      '<workbook xmlns:r="x"><sheets><sheet name="Eerst" sheetId="2" r:id="rId9"/><sheet name="Tweede" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const relaties =
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId9" Target="worksheets/sheet2.xml"/></Relationships>';
    const blad = (tekst: string) =>
      `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${tekst}</t></is></c></row></sheetData></worksheet>`;
    const zip = maakZip([
      { naam: '[Content_Types].xml', inhoud: TYPES },
      { naam: 'xl/workbook.xml', inhoud: werkboek },
      { naam: 'xl/_rels/workbook.xml.rels', inhoud: relaties },
      { naam: 'xl/worksheets/sheet1.xml', inhoud: blad('tweede tabblad') },
      { naam: 'xl/worksheets/sheet2.xml', inhoud: blad('eerste tabblad') },
    ]);
    expect((await leesXlsx(zip))[0]).toEqual(['eerste tabblad']);
  });

  it('leest een onderdeel dat niet is ingepakt (opslagmethode 0)', async () => {
    const zip = maakZip([
      { naam: '[Content_Types].xml', inhoud: TYPES, methode: 0 },
      { naam: 'xl/workbook.xml', inhoud: WERKBOEK, methode: 0 },
      { naam: 'xl/_rels/workbook.xml.rels', inhoud: RELATIES, methode: 0 },
      {
        naam: 'xl/worksheets/sheet1.xml',
        inhoud: '<worksheet><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>',
        methode: 0,
      },
    ]);
    expect((await leesXlsx(zip))[0]).toEqual([7]);
  });
});

describe('leesXlsx weigert wat niet hoort', () => {
  it('een bestand dat geen zip is', async () => {
    expect(
      await fout(new TextEncoder().encode('dit is geen excelbestand, maar tekst van voldoende lengte')),
    ).toBe('geen_xlsx');
    expect(await fout(new Uint8Array(0))).toBe('geen_xlsx');
  });

  it('een zip zonder werkboek (iets anders dan Excel)', async () => {
    expect(await fout(maakZip([{ naam: 'leesmij.txt', inhoud: 'hallo' }]))).toBe('geen_xlsx');
  });

  it('een bestand met macros, aan de naam van het onderdeel', async () => {
    expect(await fout(bestand('<row r="1"/>', [{ naam: 'xl/vbaProject.bin', inhoud: 'macro' }]))).toBe(
      'macro',
    );
  });

  it('een bestand dat zichzelf een macrowerkboek noemt', async () => {
    const zip = maakZip([
      {
        naam: '[Content_Types].xml',
        inhoud: TYPES.replace(
          '</Types>',
          '<Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>',
        ),
      },
      { naam: 'xl/workbook.xml', inhoud: WERKBOEK },
    ]);
    expect(await fout(zip)).toBe('macro');
  });

  it('een versleuteld onderdeel', async () => {
    const zip = maakZip([
      { naam: '[Content_Types].xml', inhoud: TYPES },
      { naam: 'xl/workbook.xml', inhoud: WERKBOEK, versleuteld: true },
    ]);
    expect(await fout(zip)).toBe('macro');
  });

  it('een bestand groter dan 1 MB', async () => {
    expect(await fout(new Uint8Array(MAX_BESTAND + 1))).toBe('te_groot');
  });

  it('een zip-bom: klein bestand dat veel groter uitpakt dan het zegt', async () => {
    const groot = new Uint8Array(3_000_000); // pakt in tot een paar kilobyte
    const bom = maakZip([
      { naam: '[Content_Types].xml', inhoud: TYPES },
      { naam: 'xl/workbook.xml', inhoud: WERKBOEK },
      { naam: 'xl/_rels/workbook.xml.rels', inhoud: RELATIES },
      { naam: 'xl/worksheets/sheet1.xml', inhoud: groot, loggrootte: 100 },
    ]);
    expect(bom.length).toBeLessThan(MAX_BESTAND);
    expect(await fout(bom)).toBe('te_groot');
  });

  it('een zip die meer belooft dan 10 MB uitgepakt', async () => {
    const zip = maakZip([
      { naam: '[Content_Types].xml', inhoud: TYPES },
      { naam: 'xl/workbook.xml', inhoud: WERKBOEK, loggrootte: 11_000_000 },
    ]);
    expect(await fout(zip)).toBe('te_groot');
  });

  it('een onderdeel dat korter uitpakt dan de zip zegt (beschadigd)', async () => {
    const zip = maakZip([
      { naam: '[Content_Types].xml', inhoud: TYPES },
      { naam: 'xl/workbook.xml', inhoud: WERKBOEK, loggrootte: WERKBOEK.length + 50 },
    ]);
    expect(await fout(zip)).toBe('beschadigd');
  });

  it('te veel rijen', async () => {
    expect(await fout(bestand('<row r="9999"><c r="A9999"><v>1</v></c></row>'))).toBe('te_groot');
  });

  it('te veel kolommen', async () => {
    expect(await fout(bestand('<row r="1"><c r="BA1"><v>1</v></c></row>'))).toBe('te_groot');
  });

  it('een werkboek zonder tabbladen', async () => {
    const zip = maakZip([
      { naam: '[Content_Types].xml', inhoud: TYPES },
      { naam: 'xl/workbook.xml', inhoud: '<workbook><sheets></sheets></workbook>' },
    ]);
    expect(await fout(zip)).toBe('leeg');
  });
});
