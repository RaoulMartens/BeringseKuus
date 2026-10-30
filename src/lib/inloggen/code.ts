/** Supabase ondersteunt e-mailcodes van 6 tot 10 cijfers; voorloopnullen horen bij de code. */
export function normaliseerInlogcode(waarde: unknown): string | null {
  if (typeof waarde !== 'string') return null;
  const code = waarde.replace(/\s/g, '');
  return /^\d{6,10}$/.test(code) ? code : null;
}
