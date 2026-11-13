// Mijn account toont waar je bij hoort: lid, de groepen (Raad van Elf, Dames, …) en beheer. De groepen bepalen welke activiteiten je
// ziet (R22), dus je moet ze hier terugzien. Echte gegevens, een eigen groep per test.
import { expect, test } from '@playwright/test';

import { lidIdVan } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { bevestigAdresVoor, maakLidMetRol, ruimLidOp } from './mfa-hulp.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
const aangemaakt: string[] = [];

test.afterAll(async () => {
  psql(`delete from public.groepen where naam like 'E2E Mijn % ${kenmerk}';`);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

test('Mijn account noemt je groepen, op volgorde, en zonder groep alleen "Lid"', async ({ page }) => {
  const email = nieuwAdres();
  const uid = await maakLidMetRol(email);
  aangemaakt.push(uid);
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);

  await expect(page.getByText('Je bent').locator('xpath=following-sibling::dd')).toHaveText('Lid');

  const lid = lidIdVan(uid);
  psql(`
    begin;
    insert into public.groepen (naam, volgorde) values ('E2E Mijn tweede ${kenmerk}', 97), ('E2E Mijn eerste ${kenmerk}', 96);
    insert into public.lid_groep (lid_id, groep_id) select '${lid}', id from public.groepen where naam like 'E2E Mijn % ${kenmerk}';
    commit;
  `);
  await page.reload();
  await expect(page.getByText('Je bent').locator('xpath=following-sibling::dd')).toHaveText(
    `E2E Mijn eerste ${kenmerk} en E2E Mijn tweede ${kenmerk}`,
  );
});
