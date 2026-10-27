// Een eenvoudige controle op de vorm van een e-mailadres, op de server (bouwgids 14.4: alle invoer wordt op de
// server gecontroleerd, ook als het formulier dat al deed). Of het adres bestaat, beslist Supabase.

export function normaliseerEmailadres(waarde: unknown): string | null {
  if (typeof waarde !== 'string') return null;
  const adres = waarde.trim().toLowerCase();
  if (adres.length === 0 || adres.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adres) ? adres : null;
}
