// Een verzonnen lid aanmaken, de inlogcode uit de lokale Mailpit lezen en ermee inloggen.
import { expect, type Page } from '@playwright/test';

import { leesLokaleSupabase } from '../scripts/lokale-supabase.ts';

import { maakLidMetRol, ruimLidOp } from './mfa-hulp.ts';

const lokaal = leesLokaleSupabase();
const aangemaakt: string[] = [];
export const nieuwAdres = (): string => `lid-${crypto.randomUUID()}@example.com`;
export const wacht = (ms: number): Promise<void> => new Promise((klaar) => setTimeout(klaar, ms));

export async function maakLid(email: string): Promise<void> {
  aangemaakt.push(await maakLidMetRol(email));
}
export async function ruimLedenOp(): Promise<void> {
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
}
interface Zoekresultaat {
  messages?: { ID: string }[];
}
export async function mailsAan(email: string): Promise<{ ID: string }[]> {
  const zoek = encodeURIComponent(`to:"${email}"`);
  const antwoord = await fetch(`${lokaal.mailpitUrl}/api/v1/search?query=${zoek}`);
  const uitkomst = (await antwoord.json()) as Zoekresultaat;
  return uitkomst.messages ?? [];
}
export async function inlogmailVoor(email: string): Promise<{ code: string; html: string }> {
  for (let poging = 0; poging < 40; poging += 1) {
    const [mail] = await mailsAan(email);
    if (mail) {
      const antwoord = await fetch(`${lokaal.mailpitUrl}/api/v1/message/${mail.ID}`);
      const bericht = (await antwoord.json()) as { HTML?: string };
      const html = bericht.HTML ?? '';
      const code = /<strong>\s*([0-9]{6,10})\s*<\/strong>/.exec(html)?.[1];
      if (!code) throw new Error('de mail bevat geen inlogcode');
      return { code, html };
    }
    await wacht(250);
  }
  throw new Error('binnen 10 seconden geen mail aangekomen');
}
export async function inlogcodeVoor(email: string): Promise<string> {
  return (await inlogmailVoor(email)).code;
}
export async function vraagCodeAan(page: Page, email: string): Promise<void> {
  await page.goto('/inloggen');
  await page.getByLabel('E-mailadres').fill(email);
  await page.getByRole('button', { name: 'Stuur mij een inlogcode' }).click();
  await expect(page.getByRole('heading', { name: 'Vul je inlogcode in' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Als dit e-mailadres bij ons bekend is',
  );
  expect(new URL(page.url()).searchParams.has('email')).toBe(false);
}
export async function logInMetCode(page: Page, email: string, code: string): Promise<void> {
  if (!(await page.getByLabel('Code uit je mail').isVisible())) await page.goto('/inloggen?code=1');
  await page.getByLabel('E-mailadres').fill(email);
  await page.getByLabel('Code uit je mail').fill(code);
  await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
}
export async function ingelogdLid(page: Page): Promise<string> {
  const email = nieuwAdres();
  await maakLid(email);
  await vraagCodeAan(page, email);
  await logInMetCode(page, email, await inlogcodeVoor(email));
  await expect(page).toHaveURL(/\/mijn$/);
  return email;
}
