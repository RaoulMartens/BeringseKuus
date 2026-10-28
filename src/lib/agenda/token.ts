// Het geheime token in de URL van de agenda-feed (bouwgids 4.7). Een agenda-app kan niet inloggen, dus het token
// is de toegang. Daarom: een vaste vorm, en vergelijken zonder dat de duur verraadt hoeveel tekens klopten.

const VORM = /^[A-Za-z0-9_-]{32,128}$/;

async function vingerafdruk(tekst: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst)));
}

/**
 * Klopt het gegeven token met het verwachte? Beide eerst gehasht (SHA-256), zodat ze even lang zijn, en dan elke
 * byte vergeleken zonder eerder te stoppen. Zonder ingesteld token klopt niets.
 */
export async function tokenKlopt(gegeven: string, verwacht: string | undefined): Promise<boolean> {
  if (!verwacht || !VORM.test(gegeven)) return false;
  const [a, b] = await Promise.all([vingerafdruk(gegeven), vingerafdruk(verwacht)]);
  let verschil = 0;
  for (let i = 0; i < a.length; i += 1) verschil |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return verschil === 0;
}
