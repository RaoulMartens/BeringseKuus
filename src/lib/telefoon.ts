// Een telefoonnummer van een lid. Eén regel voor de ledenlijst (scripts/leden-invoer.ts) en voor Mijn account; de database controleert
// hetzelfde (zet_eigen_telefoon), zodat een nummer dat hier door de controle komt ook daar wordt aangenomen. Zonder imports, zodat zowel de
// app als de scripts dit bestand kunnen laden.

/**
 * Een telefoonnummer, dat alle leden te zien krijgen als iemand eindverantwoordelijke is (R10): cijfers met eventueel spaties en
 * streepjes, beginnend met een 0 (een Excel-nummer zonder voorloopnul valt dus af) of een plus; 9 tot 15 cijfers en hooguit 20 tekens.
 * Spaties worden één spatie. Een gewoon Nederlands mobiel nummer zonder spaties krijgt de vorm van de rest ("06 12 34 56 78").
 */
export function normaliseerTelefoon(waarde: string): string | null {
  const schoon = waarde.trim().replace(/\s+/g, ' ');
  if (schoon.length > 20 || !/^[0+][\d -]*$/.test(schoon)) return null;
  const cijfers = schoon.replace(/\D/g, '');
  if (cijfers.length < 9 || cijfers.length > 15) return null;
  const zonder = schoon.replace(/ /g, '');
  if (/^06\d{8}$/.test(zonder))
    return `${zonder.slice(0, 2)} ${zonder.slice(2, 4)} ${zonder.slice(4, 6)} ${zonder.slice(6, 8)} ${zonder.slice(8)}`;
  return schoon;
}

/** Wat een lid ziet als het nummer niet klopt. */
export const TELEFOON_HULP =
  'Een nummer dat met 0 of + begint, bijvoorbeeld 06 12 34 56 78. Spaties en streepjes mogen.';
