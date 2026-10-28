// Omgevingsvariabelen die de app nodig heeft. Online staan ze als geheim bij de Worker (docs/hosting.md); lokaal
// schrijft `npm run env:lokaal` ze. Ze worden alleen op de server gelezen, nooit in de browser.

export function verplicht(naam: string): string {
  const waarde = process.env[naam];
  if (!waarde) throw new Error(`De omgevingsvariabele ${naam} ontbreekt (zie .env.example).`);
  return waarde;
}
