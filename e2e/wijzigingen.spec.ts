// Het wijzigingenlog (UC-015), met echte gegevens: een beheerder opent het vanuit Ledenbeheer, ziet de regels per dag, filtert en bladert. Wat erin staat en
// wie het mag lezen staat in de databasetests (wijzigingenlog.test.sql); deze test bewijst het scherm en de route ernaartoe.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { lidIdVan, logInAlsBeheerder, maakTestlid, ruimTestledenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
const aangemaakt: string[] = [];

test.afterAll(async () => {
  psql(`delete from public.wijzigingen_log where omschrijving like '%${kenmerk}%';`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) {
    psql(`delete from public.wijzigingen_log where rij_id = '${lidIdVan(uid)}';`);
    await ruimLidOp(uid);
  }
});

test('een beheerder ziet het wijzigingenlog, filtert en bladert', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const lid = maakTestlid('Loes', kenmerk);

  // 60 regels met een eigen tekst (zo ver terug dat andere tests ze niet verdringen) plus een paar met een eigen soort.
  psql(`
    insert into public.wijzigingen_log (actie, tabel, rij_id, omschrijving, moment)
    select 'activiteit_gewijzigd', 'activiteiten', gen_random_uuid(), 'Oud ' || g || ' ${kenmerk}', now() - interval '3 days' - g * interval '1 minute'
      from generate_series(1, 60) g;
    insert into public.wijzigingen_log (actie, tabel, rij_id, omschrijving)
    values ('plek_toegewezen', 'leden', '${lid.id}', '${lid.naam} ingedeeld als werker bij Proef ${kenmerk}'),
           ('afgemeld', 'afmeldingen', gen_random_uuid(), 'afgemeld voor activiteit ${kenmerk}'),
           ('lid_toegevoegd', 'leden', '${lid.id}', 'Lid ${kenmerk} toegevoegd en uitgenodigd');
  `);

  // De ingang staat in de kaart Ledenbeheer.
  await page.goto('/beheer');
  await page.getByRole('link', { name: /^Wijzigingen/ }).click();
  await expect(page).toHaveURL(/\/beheer\/wijzigingen$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Wijzigingen' })).toBeVisible();
  await expect(page.getByText('Vandaag', { exact: true }).first()).toBeVisible();
  // Afmeldingen staan er niet in.
  await expect(page.getByText(`afgemeld voor activiteit ${kenmerk}`)).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Een regel over een lid opent dat lid. (Het log is gedeeld met andere tests: de inhoud kijken we per filter na, waar de lijst kort is.)
  await page.goto('/beheer/wijzigingen?soort=leden');
  await expect(page.getByText(`Lid ${kenmerk} toegevoegd en uitgenodigd`)).toBeVisible();
  await page.getByRole('link', { name: new RegExp(`Lid ${kenmerk} toegevoegd`) }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/leden/${lid.id}$`));

  // Het filter staat in de adresbalk en toont alleen die soort.
  await page.goto('/beheer/wijzigingen?soort=leden');
  await page.getByRole('link', { name: 'Diensten', exact: true }).click();
  await expect(page).toHaveURL(/\/beheer\/wijzigingen\?soort=diensten$/);
  await expect(page.getByText(`${lid.naam} ingedeeld als werker bij Proef ${kenmerk}`)).toBeVisible();
  await expect(page.getByText(`Lid ${kenmerk} toegevoegd`)).toHaveCount(0);

  // Bladeren: 50 per keer, "Toon oudere wijzigingen" brengt de rest.
  await page.goto('/beheer/wijzigingen?soort=activiteiten');
  await expect(page.getByRole('link', { name: 'Toon oudere wijzigingen' })).toBeVisible();
  await page.getByRole('link', { name: 'Toon oudere wijzigingen' }).click();
  await expect(page).toHaveURL(/voor=\d+/);
  await expect(page.getByText(/^Oud \d+ /).first()).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
});

test('zonder inloggen komt niemand bij het wijzigingenlog', async ({ page }) => {
  await page.goto('/beheer/wijzigingen');
  await expect(page).not.toHaveURL(/\/beheer\/wijzigingen$/);
});
