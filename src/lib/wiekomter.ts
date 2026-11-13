// "Wie komt er?" (UC-010): per activiteit één bolletje met initialen voor elk lid voor wie de activiteit is. Gevuld = komt,
// gestippeld = afgemeld. De reden van een afmelding staat er niet en is er ook niet: de database geeft haar niet mee.
// Dit bestand maakt van de rijen uit wie_komt_er() wat het scherm toont; het scherm zelf staat in components/wiekomter.

/** Eén rij uit de databasefunctie wie_komt_er(). */
export interface WieKomtErRij {
  lid_id: string;
  voornaam: string;
  achternaam: string;
  komt: boolean;
}

export interface RasterLid {
  lidId: string;
  /** De hele naam, voor de tekst bij een bolletje ("Theo Verstraten"; "Mark Hendriks (jij)" voor jezelf). */
  naam: string;
  initialen: string;
  komt: boolean;
}

export interface Raster {
  leden: RasterLid[];
  aanwezig: number;
  afgemeld: number;
}

// Tussenvoegsels van Nederlandse achternamen: ze tellen niet mee voor de initiaal, ook niet met een hoofdletter (zoals in "Van der Voorbeeld"
// of "Van Test", zoals ze soms zijn ingevoerd). De lijst volgt de gangbare lijst van tussenvoegsels in het Nederlands.
const TUSSENVOEGSELS = new Set([
  'aan',
  'af',
  'al',
  'bij',
  'de',
  'den',
  'der',
  'di',
  'die',
  'du',
  'el',
  'het',
  'in',
  'la',
  'le',
  'les',
  'onder',
  'op',
  'over',
  'te',
  'ten',
  'ter',
  'tot',
  'uit',
  'uijt',
  'van',
  'vanden',
  'vander',
  'ver',
  'von',
  'voor',
  'vor',
  "'s",
  "'t",
  '’s',
  '’t',
]);

/** Het woord van de achternaam waar de initiaal van komt: het eerste woord dat geen tussenvoegsel is ("van der Berg" wordt Berg, "d'Hondt" wordt Hondt). */
function hoofdwoord(achternaam: string): string {
  const woorden = achternaam.trim().split(/\s+/).filter(Boolean);
  for (const woord of woorden) {
    // een tussenvoegsel dat aan de naam vastzit: d'Hondt, 's-Gravesande, 't-Hart
    const vast = /^(?:d['’]|l['’]|['’]s-?|['’]t-?)(.+)$/i.exec(woord);
    if (vast?.[1]) return vast[1];
    if (TUSSENVOEGSELS.has(woord.toLowerCase())) continue;
    return woord;
  }
  return woorden[0] ?? '';
}

/** De eerste letter van een woord; "IJ" is in het Nederlands één letter. */
function eersteLetter(tekst: string): string {
  const letters = Array.from(tekst).filter((teken) => /\p{L}/u.test(teken));
  const [eerste = '', tweede = ''] = letters;
  if (eerste.toLowerCase() === 'i' && tweede.toLowerCase() === 'j') return 'IJ';
  return eerste.toLocaleUpperCase('nl-NL');
}

/**
 * De initialen: de eerste letter van de voornaam en de eerste letter van de achternaam zonder tussenvoegsel ("Ger van Hout" wordt GH,
 * "Piet Van Test" PT, "Anna Van der Voorbeeld" AV). "IJ" telt als één letter. Twee leden kunnen dezelfde initialen hebben; het
 * bolletje is er niet voor het onderscheid maar voor het overzicht, de naam staat bij hover, focus en voor een schermlezer.
 */
export function initialen(voornaam: string, achternaam: string): string {
  return eersteLetter(voornaam) + eersteLetter(hoofdwoord(achternaam));
}

/** Het raster en de telling uit de rijen; de volgorde van de database (achternaam, voornaam) blijft staan. */
export function maakRaster(rijen: WieKomtErRij[], eigenLidId: string): Raster {
  const leden = rijen.map((rij) => {
    const naam = `${rij.voornaam} ${rij.achternaam}`;
    return {
      lidId: rij.lid_id,
      naam: rij.lid_id === eigenLidId ? `${naam} (jij)` : naam,
      initialen: initialen(rij.voornaam, rij.achternaam),
      komt: rij.komt,
    };
  });
  const afgemeld = leden.filter((lid) => !lid.komt).length;
  return { leden, aanwezig: leden.length - afgemeld, afgemeld };
}
