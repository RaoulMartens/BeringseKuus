// De bak bij de Bonte Avond (BA-8, R23), met echte gegevens: de beheerder zet de bak aan op het activiteitscherm (vooraf gevuld met de
// Raad van Elf), kiest wie erin zit en slaat op; een lid ziet de bak als lijst, met "Je zit in de bak" en zonder knop Afmelden. De
// controles zelf (alles of niets, dubbelboeking, twee beheerders tegelijk, wie niet in de bak kan) staan in bak.test.sql; deze tests
// bewijzen formulier, serveractie en wat een lid daarna ziet.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  lidIdVan,
  logInAlsBeheerder,
  maakTestlid,
  ruimActiviteitenOp,
  ruimTestledenOp,
} from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { bevestigAdresVoor, maakLidMetRol, ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
const naamBeheer = `E2E Bak beheer ${kenmerk}`;
const naamLid = `E2E Bak lid ${kenmerk}`;
const groep = `E2E Bak groep ${kenmerk}`;
const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Bak % ${kenmerk}`);
  psql(`delete from public.wijzigingen_log where omschrijving like '%E2E Bak % ${kenmerk}%';`);
  psql(`delete from public.groepen where naam = '${groep}';`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

/** Een gepubliceerde activiteit met tijden en locatie, en een eindverantwoordelijke met nummer (R21). */
function maakGepubliceerd(naam: string, datum: string, ev: string): string {
  const id = psql(`
    insert into public.activiteiten (naam, datum, verzameltijd, starttijd, eindtijd, locatie, status)
    values ('${naam}', '${datum}', '18:30', '20:00', '23:00', 'Zaal Test', 'gepubliceerd')
    returning id;
  `)
    .trim()
    .split('\n')[0]!;
  psql(
    `insert into public.rol_slots (activiteit_id, rol_type, volgorde, bezetter_id) values ('${id}', 'eindverantwoordelijke', 0, '${ev}');`,
  );
  return id;
}

test('de beheerder zet de bak aan, vooraf gevuld met de Raad van Elf, kiest wie erin zit en slaat op', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const ger = maakTestlid('GerBak', kenmerk, { telefoon: '06 12 34 56 78', magEindverantwoordelijke: true });
  const prins = maakTestlid('PrinsBak', kenmerk);
  const raad1 = maakTestlid('RaadEen', kenmerk);
  const raad2 = maakTestlid('RaadTwee', kenmerk);
  psql(`
    insert into public.lid_groep (lid_id, groep_id)
      select l.id, g.id from public.leden l, public.groepen g
       where l.id in ('${raad1.id}', '${raad2.id}') and g.naam = 'Raad van Elf';
  `);
  const id = maakGepubliceerd(naamBeheer, '2099-08-01', ger.id);

  await page.goto(`/beheer/activiteiten/${id}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Bak' })).toBeVisible();
  const schakelaar = page.getByLabel('Bak bijhouden bij deze activiteit');
  await expect(schakelaar).not.toBeChecked();
  // Uit: alleen de schakelaar, geen plekken.
  await expect(page.getByLabel('Prins', { exact: true })).toHaveCount(0);

  await schakelaar.check();
  // Vooraf gevuld: prins, adjudant en vorst leeg, en de leden van de Raad van Elf (onze twee staan erbij).
  await expect(page.getByLabel('Prins', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Adjudant')).toHaveValue('');
  await expect(page.getByLabel('Vorst')).toHaveValue('');
  const gekozen = await page
    .locator('select[id^="bak-plek-"]')
    .evaluateAll((selects) => selects.map((select) => (select as HTMLSelectElement).value));
  expect(gekozen).toContain(raad1.id);
  expect(gekozen).toContain(raad2.id);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  await page.getByLabel('Prins', { exact: true }).selectOption(prins.id);
  await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);

  // De database: de bak staat aan, de prins en de twee raadsleden zitten erin, de andere plekken zijn leeg.
  expect(psql(`select bak_actief from public.activiteiten where id = '${id}';`).trim()).toBe('t');
  expect(
    psql(
      `select plek_label from public.rol_slots where activiteit_id = '${id}' and rol_type = 'bak' and bezetter_id = '${prins.id}';`,
    ).trim(),
  ).toBe('prins');
  expect(
    psql(`select count(*) from public.rol_slots where activiteit_id = '${id}' and rol_type = 'bak' and plek_label = 'raadslid'
           and bezetter_id in ('${raad1.id}', '${raad2.id}');`).trim(),
  ).toBe('2');

  // Terug op het scherm: de schakelaar staat aan en de keuze is er nog.
  await page.goto(`/beheer/activiteiten/${id}`);
  await expect(page.getByLabel('Bak bijhouden bij deze activiteit')).toBeChecked();
  await expect(page.getByLabel('Prins', { exact: true })).toHaveValue(prins.id);

  // Weer uit: de plekken gaan weg.
  await page.getByLabel('Bak bijhouden bij deze activiteit').uncheck();
  await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  expect(
    psql(`select count(*) from public.rol_slots where activiteit_id = '${id}' and rol_type = 'bak';`).trim(),
  ).toBe('0');
  expect(psql(`select bak_actief from public.activiteiten where id = '${id}';`).trim()).toBe('f');
});

test('een lid ziet de bak als lijst, "Je zit in de bak" en geen knop Afmelden', async ({ page }) => {
  const email = nieuwAdres();
  const uid = await maakLidMetRol(email);
  aangemaakt.push(uid);
  const lidId = lidIdVan(uid);
  const ger = maakTestlid('GerLid', kenmerk, { telefoon: '06 98 76 54 32', magEindverantwoordelijke: true });
  const prins = maakTestlid('PrinsLid', kenmerk);
  const raad = maakTestlid('RaadLid', kenmerk);
  // De activiteit is alleen voor dit lid (een eigen groep), zodat andere tests hem niet zien.
  const id = maakGepubliceerd(naamLid, '2099-08-02', ger.id);
  psql(`
    insert into public.groepen (naam, volgorde) values ('${groep}', 97);
    insert into public.lid_groep (lid_id, groep_id) select '${lidId}', id from public.groepen where naam = '${groep}';
    insert into public.activiteit_groep (activiteit_id, groep_id) select '${id}', id from public.groepen where naam = '${groep}';
    update public.activiteiten set bak_actief = true where id = '${id}';
    insert into public.rol_slots (activiteit_id, rol_type, bezetter_id, plek_label, volgorde) values
      ('${id}', 'bak', '${prins.id}', 'prins', 101),
      ('${id}', 'bak', null, 'adjudant', 102),
      ('${id}', 'bak', '${lidId}', 'raadslid', 103),
      ('${id}', 'bak', '${raad.id}', 'raadslid', 104);
  `);

  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);
  await page.goto(`/programma/${id}`);

  const bak = page.getByRole('region', { name: `Bak ${naamLid}` });
  await expect(bak.getByRole('heading', { level: 2, name: 'Bak' })).toBeVisible();
  // Kopjes in vaste volgorde, alleen waar iemand zit (de adjudant is leeg en dus onzichtbaar), jezelf herkenbaar.
  await expect(bak.getByText('Prins en adjudant')).toBeVisible();
  await expect(bak.getByText(prins.naam)).toBeVisible();
  await expect(bak.getByText('Raad van Elf')).toBeVisible();
  await expect(bak.getByText(raad.naam)).toBeVisible();
  await expect(bak.getByText(/\(jij\)/)).toHaveCount(1);
  await expect(bak.getByText('Vorst')).toHaveCount(0);

  // Je zit in de bak: geen afmelden, wel het nummer van de eindverantwoordelijke.
  // De statuskaart staat twee keer in de pagina (zijkolom op desktop, boven op mobiel); één is zichtbaar.
  await expect(page.getByText('Je zit in de bak.').filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Afmelden' })).toHaveCount(0);
  await expect(
    page
      .getByText(/06 98 76 54 32/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
