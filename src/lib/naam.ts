// Namen van leden: tussenvoegsels in Nederlandse achternamen. Eén bron voor de initialen in het raster "Wie komt er?" en voor het inlezen
// van een ledenlijst (scripts/leden-invoer.ts). Zonder imports, zodat zowel de app als de scripts dit bestand kunnen laden.

// De gangbare tussenvoegsels in het Nederlands. Ze tellen niet mee voor de initiaal, ook niet met een hoofdletter, en ze krijgen een
// kleine letter als er een voornaam voor staat ("Piet van Voorbeeld", niet "Piet Van Voorbeeld").
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

// Een tussenvoegsel dat aan de naam vastzit: d'Hondt, l'Ami, 's-Gravesande, 't-Hart.
const VAST = /^(d['’]|l['’]|['’]s-?|['’]t-?)(.+)$/i;

function woorden(achternaam: string): string[] {
  return achternaam.trim().split(/\s+/).filter(Boolean);
}

/** Het woord van de achternaam waar de initiaal van komt: het eerste woord dat geen tussenvoegsel is ("van der Berg" wordt Berg, "d'Hondt" wordt Hondt). */
export function hoofdwoord(achternaam: string): string {
  const alle = woorden(achternaam);
  for (const woord of alle) {
    const vast = VAST.exec(woord);
    if (vast?.[2]) return vast[2];
    if (TUSSENVOEGSELS.has(woord.toLowerCase())) continue;
    return woord;
  }
  return alle[0] ?? '';
}

/**
 * Zet de tussenvoegsels aan het begin van een achternaam op een kleine letter: "Van der Voorbeeld" wordt "van der Voorbeeld", "D'Hondt"
 * wordt "d'Hondt". Het eerste woord dat geen tussenvoegsel is, en alles daarna, blijft zoals het is. Bestaat de hele achternaam uit
 * tussenvoegsels, dan blijft hij ongewijzigd.
 */
export function kleineTussenvoegsels(achternaam: string): string {
  const alle = woorden(achternaam);
  let naamGevonden = false;
  const uit = alle.map((woord) => {
    if (naamGevonden) return woord;
    const vast = VAST.exec(woord);
    if (vast?.[2]) {
      naamGevonden = true;
      return (vast[1] ?? '').toLowerCase() + vast[2];
    }
    if (TUSSENVOEGSELS.has(woord.toLowerCase())) return woord.toLowerCase();
    naamGevonden = true;
    return woord;
  });
  return naamGevonden ? uit.join(' ') : achternaam;
}
