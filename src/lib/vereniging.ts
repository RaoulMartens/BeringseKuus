// Wat bij de vereniging hoort en niet in een onderdeel mag staan (CLAUDE.md: geen Beringse-naam of -dialect hard in de
// componenten). Tot er een scherm is waar het bestuur dit instelt, staat het hier op één plek; de volgende stap is
// verenigingsinstellingen uit de database (Fase-1-plan, na de pilot: meer verenigingen).

export const VERENIGING = {
  naam: 'De Beringse Kuus',
  /** Het woord voor het seizoen: "Vastelaovend 2026/2027". */
  seizoensnaam: 'Vastelaovend',
} as const;

/** "Vastelaovend 2026/2027" voor een seizoen dat in de database als beginjaar (2026) staat. */
export function seizoenTitel(beginjaar: number): string {
  return `${VERENIGING.seizoensnaam} ${beginjaar}/${beginjaar + 1}`;
}
