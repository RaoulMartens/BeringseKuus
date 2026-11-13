// Een Excel-bestand (.xlsx) lezen, zonder pakket (bouwgids 6.2, "Lezen"). Een .xlsx is een zip-bestand met XML erin. De browser
// kan zelf uitpakken (DecompressionStream); wat hier staat is het lezen van de zip, het kiezen van het eerste tabblad en het
// omzetten van de cellen naar tekst en getallen. Het bestand verlaat de browser niet: de server krijgt alleen de regels die
// eruit komen en controleert die zelf opnieuw (activiteiten_bulk_aanmaken).
//
// Wat het bewust wel en niet doet:
//  - alleen het eerste tabblad, en alleen waarden: een formule wordt nooit uitgevoerd (de waarde die Excel erbij bewaarde, wel);
//  - een bestand met macro's (.xlsm, of een vbaProject erin) wordt geweigerd; dat geldt ook voor een beveiligd (versleuteld) bestand;
//  - grenzen: het bestand mag niet groter zijn dan 1 MB, het uitgepakte niet dan 10 MB (een klein bestand dat enorm uitpakt, is een
//    zip-bom), er zijn hooguit 200 onderdelen, 5.000 rijen en 50 kolommen. Bij overschrijding komt er een duidelijke melding.
// De foutcodes staan in XlsxFout; src/lib/activiteitenimport.ts zet ze om naar tekst voor de beheerder.

export type Cel = string | number | null;

export type XlsxFoutCode =
  | 'geen_xlsx' // geen zip, of geen geldig Excel-bestand
  | 'macro' // een bestand met macro's of een versleuteld bestand
  | 'te_groot' // te groot, of te veel rijen of kolommen
  | 'beschadigd' // de zip of de XML klopt niet
  | 'leeg'; // geen tabblad

export class XlsxFout extends Error {
  readonly code: XlsxFoutCode;
  constructor(code: XlsxFoutCode) {
    super(code);
    this.name = 'XlsxFout';
    this.code = code;
  }
}

export const MAX_BESTAND = 1_000_000;
export const MAX_UITGEPAKT = 10_000_000;
const MAX_ONDERDELEN = 200;
const MAX_RIJEN = 5000;
const MAX_KOLOMMEN = 50;

// ===== De zip =====

interface Onderdeel {
  naam: string;
  methode: number;
  gecomprimeerd: number;
  grootte: number;
  versleuteld: boolean;
  kop: number;
}

const HANDTEKENING_EOCD = 0x06054b50;
const HANDTEKENING_CENTRAAL = 0x02014b50;
const HANDTEKENING_LOKAAL = 0x04034b50;

function leesOnderdelen(bytes: Uint8Array): Map<string, Onderdeel> {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new XlsxFout('geen_xlsx');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Het eind van de zip: de handtekening staat in de laatste 64 KB + 22 bytes (de opmerking mag tot 64 KB lang zijn).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (dv.getUint32(i, true) === HANDTEKENING_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxFout('geen_xlsx');

  const aantal = dv.getUint16(eocd + 10, true);
  const mapGrootte = dv.getUint32(eocd + 12, true);
  const mapStart = dv.getUint32(eocd + 16, true);
  // ZIP64 (veldwaarden op het maximum) komt in een klein Excel-bestand niet voor.
  if (aantal === 0xffff || mapGrootte === 0xffffffff || mapStart === 0xffffffff)
    throw new XlsxFout('te_groot');
  if (aantal > MAX_ONDERDELEN) throw new XlsxFout('te_groot');
  if (mapStart + mapGrootte > bytes.length) throw new XlsxFout('beschadigd');

  const onderdelen = new Map<string, Onderdeel>();
  const decoder = new TextDecoder('utf-8');
  let pos = mapStart;
  let totaal = 0;
  for (let n = 0; n < aantal; n++) {
    if (pos + 46 > bytes.length || dv.getUint32(pos, true) !== HANDTEKENING_CENTRAAL)
      throw new XlsxFout('beschadigd');
    const vlaggen = dv.getUint16(pos + 8, true);
    const methode = dv.getUint16(pos + 10, true);
    const gecomprimeerd = dv.getUint32(pos + 20, true);
    const grootte = dv.getUint32(pos + 24, true);
    const naamLengte = dv.getUint16(pos + 28, true);
    const extraLengte = dv.getUint16(pos + 30, true);
    const opmerkingLengte = dv.getUint16(pos + 32, true);
    const kop = dv.getUint32(pos + 42, true);
    if (gecomprimeerd === 0xffffffff || grootte === 0xffffffff || kop === 0xffffffff)
      throw new XlsxFout('te_groot');
    if (pos + 46 + naamLengte > bytes.length) throw new XlsxFout('beschadigd');
    const naam = decoder.decode(bytes.subarray(pos + 46, pos + 46 + naamLengte));
    totaal += grootte;
    if (totaal > MAX_UITGEPAKT) throw new XlsxFout('te_groot');
    onderdelen.set(naam, { naam, methode, gecomprimeerd, grootte, versleuteld: (vlaggen & 1) === 1, kop });
    pos += 46 + naamLengte + extraLengte + opmerkingLengte;
  }
  return onderdelen;
}

/** Pakt één onderdeel uit, en breekt af zodra er meer uitkomt dan de zip zegt dat er in zit (zip-bom). */
async function pakUit(bytes: Uint8Array, onderdeel: Onderdeel): Promise<Uint8Array> {
  if (onderdeel.versleuteld) throw new XlsxFout('macro');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kop = onderdeel.kop;
  if (kop + 30 > bytes.length || dv.getUint32(kop, true) !== HANDTEKENING_LOKAAL)
    throw new XlsxFout('beschadigd');
  const start = kop + 30 + dv.getUint16(kop + 26, true) + dv.getUint16(kop + 28, true);
  const eind = start + onderdeel.gecomprimeerd;
  if (eind > bytes.length) throw new XlsxFout('beschadigd');
  const data = bytes.subarray(start, eind);

  if (onderdeel.methode === 0) {
    if (data.length !== onderdeel.grootte) throw new XlsxFout('beschadigd');
    return data;
  }
  if (onderdeel.methode !== 8) throw new XlsxFout('beschadigd');

  const stroom = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const lezer = stroom.getReader();
  const stukken: Uint8Array[] = [];
  let lengte = 0;
  try {
    for (;;) {
      const { done, value } = await lezer.read();
      if (done) break;
      lengte += value.length;
      if (lengte > onderdeel.grootte || lengte > MAX_UITGEPAKT) {
        await lezer.cancel();
        throw new XlsxFout('te_groot');
      }
      stukken.push(value);
    }
  } catch (fout) {
    if (fout instanceof XlsxFout) throw fout;
    throw new XlsxFout('beschadigd');
  }
  if (lengte !== onderdeel.grootte) throw new XlsxFout('beschadigd');
  const uit = new Uint8Array(lengte);
  let offset = 0;
  for (const stuk of stukken) {
    uit.set(stuk, offset);
    offset += stuk.length;
  }
  return uit;
}

// ===== De XML =====

const ENTITEITEN: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function ontsnap(tekst: string): string {
  return tekst.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_hele, naam: string) => {
    if (naam.startsWith('#x')) return String.fromCodePoint(Number.parseInt(naam.slice(2), 16));
    if (naam.startsWith('#')) return String.fromCodePoint(Number.parseInt(naam.slice(1), 10));
    return ENTITEITEN[naam] ?? '';
  });
}

/** De waarde van een attribuut in een tag, zonder het voorvoegsel van de naamruimte te verwarren (r:id telt als "r:id"). */
function attribuut(tag: string, naam: string): string | null {
  const m = new RegExp(`(?:^|\\s)${naam.replace(':', '\\:')}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  if (!m) return null;
  return ontsnap(m[2] ?? m[3] ?? '');
}

/** Alle tekst in <t>-elementen binnen een stuk XML (ook in rijke tekst met <r>-stukken); fonetische hulptekst telt niet mee. */
function tekstVan(xml: string): string {
  const zonder = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let tekst = '';
  for (const m of zonder.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) tekst += ontsnap(m[1] ?? '');
  return tekst;
}

function kolomIndex(verwijzing: string): number {
  const m = /^([A-Z]+)\d+$/.exec(verwijzing);
  if (!m?.[1]) return -1;
  let n = 0;
  for (const letter of m[1]) n = n * 26 + (letter.charCodeAt(0) - 64);
  return n - 1;
}

function gedeeldeTekst(xml: string): string[] {
  const lijst: string[] = [];
  for (const m of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) lijst.push(tekstVan(m[1] ?? ''));
  return lijst;
}

function celWaarde(attributen: string, inhoud: string, gedeeld: string[]): Cel {
  const soort = attribuut(attributen, 't');
  if (soort === 'inlineStr') return tekstVan(inhoud);
  const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inhoud)?.[1];
  if (v === undefined) return null;
  const waarde = ontsnap(v);
  if (soort === 's') return gedeeld[Number.parseInt(waarde, 10)] ?? null;
  if (soort === 'str' || soort === 'd') return waarde;
  if (soort === 'e') return null;
  if (soort === 'b') return waarde === '1' ? 1 : 0;
  const getal = Number(waarde);
  return Number.isFinite(getal) ? getal : null;
}

/** Het pad van het eerste tabblad, in de volgorde van het werkboek (niet op bestandsnaam). */
function eersteTabblad(werkboek: string, relaties: string | null): string {
  const eerste = /<sheet\b[^>]*>/.exec(werkboek)?.[0];
  if (!eerste) throw new XlsxFout('leeg');
  const id = attribuut(eerste, 'r:id');
  if (id && relaties) {
    for (const m of relaties.matchAll(/<Relationship\b[^>]*>/g)) {
      if (attribuut(m[0], 'Id') !== id) continue;
      const doel = attribuut(m[0], 'Target');
      if (!doel) break;
      return doel.startsWith('/') ? doel.slice(1) : `xl/${doel.replace(/^\.\//, '')}`;
    }
  }
  return 'xl/worksheets/sheet1.xml';
}

/**
 * De cellen van het eerste tabblad. De uitkomst is een lijst rijen (rij 1 van Excel is index 0), elke rij een lijst cellen per
 * kolom (kolom A is index 0); een cel die niet is ingevuld is null. Gooit een XlsxFout als het geen bruikbaar bestand is.
 */
export async function leesXlsx(bytes: Uint8Array): Promise<Cel[][]> {
  if (bytes.length > MAX_BESTAND) throw new XlsxFout('te_groot');
  const onderdelen = leesOnderdelen(bytes);
  if ([...onderdelen.keys()].some((naam) => /vbaProject\.bin$/i.test(naam))) throw new XlsxFout('macro');
  const decoder = new TextDecoder('utf-8');
  const tekst = async (naam: string): Promise<string | null> => {
    const o = onderdelen.get(naam);
    return o ? decoder.decode(await pakUit(bytes, o)) : null;
  };

  const types = await tekst('[Content_Types].xml');
  if (types === null || !onderdelen.has('xl/workbook.xml')) throw new XlsxFout('geen_xlsx');
  if (/macroEnabled/i.test(types)) throw new XlsxFout('macro');

  const werkboek = await tekst('xl/workbook.xml');
  if (werkboek === null) throw new XlsxFout('geen_xlsx');
  const pad = eersteTabblad(werkboek, await tekst('xl/_rels/workbook.xml.rels'));
  const blad = await tekst(pad);
  if (blad === null) throw new XlsxFout('leeg');
  const gedeeld = gedeeldeTekst((await tekst('xl/sharedStrings.xml')) ?? '');

  const rijen: Cel[][] = [];
  let volgendeRij = 0;
  for (const rm of blad.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const nummer = attribuut(rm[1] ?? '', 'r');
    const index = nummer !== null && /^\d+$/.test(nummer) ? Number.parseInt(nummer, 10) - 1 : volgendeRij;
    volgendeRij = index + 1;
    if (index < 0 || index >= MAX_RIJEN) throw new XlsxFout('te_groot');
    const cellen: Cel[] = [];
    let volgendeKolom = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const verwijzing = attribuut(cm[1] ?? '', 'r');
      const kolom = verwijzing ? kolomIndex(verwijzing) : volgendeKolom;
      volgendeKolom = kolom + 1;
      if (kolom < 0 || kolom >= MAX_KOLOMMEN) throw new XlsxFout('te_groot');
      cellen[kolom] = celWaarde(cm[1] ?? '', cm[2] ?? '', gedeeld);
    }
    // Gaten (een niet ingevulde cel tussen twee ingevulde) zijn null in plaats van "leeg in de lijst".
    for (let k = 0; k < cellen.length; k++) cellen[k] ??= null;
    while (rijen.length < index) rijen.push([]);
    rijen[index] = cellen;
  }
  return rijen;
}
