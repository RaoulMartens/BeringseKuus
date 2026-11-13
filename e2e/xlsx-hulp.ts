// Een klein .xlsx-bestand bouwen voor de browsertests van de Excel-import: één tabblad met tekst en getallen, zoals Excel het bewaart
// (een datum als serienummer, tekst als losse tekstcel). Alleen wat de lezer in src/lib/xlsx.ts nodig heeft.
import { deflateRawSync } from 'node:zlib';

type Cel = string | number | null;

interface Deel {
  naam: string;
  inhoud: string;
}

function maakZip(delen: Deel[]): Buffer {
  const stukken: Buffer[] = [];
  const centraal: Buffer[] = [];
  let offset = 0;
  for (const deel of delen) {
    const naam = Buffer.from(deel.naam);
    const ruw = Buffer.from(deel.inhoud);
    const data = deflateRawSync(ruw);

    const lokaal = Buffer.alloc(30 + naam.length);
    lokaal.writeUInt32LE(0x04034b50, 0);
    lokaal.writeUInt16LE(20, 4);
    lokaal.writeUInt16LE(8, 8);
    lokaal.writeUInt32LE(data.length, 18);
    lokaal.writeUInt32LE(ruw.length, 22);
    lokaal.writeUInt16LE(naam.length, 26);
    naam.copy(lokaal, 30);

    const kop = Buffer.alloc(46 + naam.length);
    kop.writeUInt32LE(0x02014b50, 0);
    kop.writeUInt16LE(20, 4);
    kop.writeUInt16LE(20, 6);
    kop.writeUInt16LE(8, 10);
    kop.writeUInt32LE(data.length, 20);
    kop.writeUInt32LE(ruw.length, 24);
    kop.writeUInt16LE(naam.length, 28);
    kop.writeUInt32LE(offset, 42);
    naam.copy(kop, 46);

    stukken.push(lokaal, data);
    centraal.push(kop);
    offset += lokaal.length + data.length;
  }
  const map = Buffer.concat(centraal);
  const eind = Buffer.alloc(22);
  eind.writeUInt32LE(0x06054b50, 0);
  eind.writeUInt16LE(delen.length, 8);
  eind.writeUInt16LE(delen.length, 10);
  eind.writeUInt32LE(map.length, 12);
  eind.writeUInt32LE(offset, 16);
  return Buffer.concat([...stukken, map, eind]);
}

function kolomLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function ontsnap(tekst: string): string {
  return tekst.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Een .xlsx met de gegeven rijen op het eerste (en enige) tabblad. null is een lege cel. */
export function maakXlsx(rijen: Cel[][]): Buffer {
  const sheet = rijen
    .map((rij, r) => {
      const cellen = rij
        .map((cel, k) => {
          const ref = `${kolomLetter(k)}${r + 1}`;
          if (cel === null) return '';
          return typeof cel === 'number'
            ? `<c r="${ref}"><v>${cel}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t>${ontsnap(cel)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cellen}</row>`;
    })
    .join('');
  return maakZip([
    {
      naam: '[Content_Types].xml',
      inhoud:
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    },
    {
      naam: 'xl/workbook.xml',
      inhoud:
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Activiteiten" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      naam: 'xl/_rels/workbook.xml.rels',
      inhoud:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    {
      naam: 'xl/worksheets/sheet1.xml',
      inhoud: `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`,
    },
  ]);
}

/** Het serienummer dat Excel voor een datum (YYYY-MM-DD) bewaart: dagen sinds 30-12-1899. */
export function excelDatum(iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);
}
