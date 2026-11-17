// Een seizoen kopiëren (UC-006, "Vorig seizoen kopiëren"), met echte gegevens: een klein vorig seizoen staat in de database, de
// beheerder kiest het seizoen en de activiteit met de bekende datum, loopt de regels na en maakt de concepten aan. De rekenregels
// (verschuiven, 11 november, de afmeld-deadline) staan in src/lib/kopieren.test.ts; de controles van de database in
// bulk_aanmaken.test.sql. Deze test bewijst het geheel: de pagina, de serveractie en wat er in de database komt te staan.
//
// Het vorige seizoen heeft een beginjaar ver in de toekomst, zodat het geen echte gegevens raakt. De twee schermbreedtes draaien
// tegelijk en hebben elk hun eigen seizoen (2090 en 2070), zodat ze elkaars activiteiten niet zien. Beide nieuwe seizoenen
// beginnen in een jaar vóór een schrikkeljaar, dus de verschuiving is in beide 385 dagen.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { lidIdVan, logInAlsBeheerder, ruimActiviteitenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const lopende = crypto.randomUUID().slice(0, 8);
const elfde = `E2E Kopie Elfde ${lopende}`;
const avond = `E2E Kopie Avond ${lopende}`;
const optocht = `E2E Kopie Optocht ${lopende}`;
const aangemaakt: string[] = [];

/** Het beginjaar van het vorige seizoen van deze schermbreedte. */
const beginjaar = (project: string): number => (project === 'telefoon' ? 2070 : 2090);

test.beforeAll(({}, info) => {
  const j = beginjaar(info.project.name);
  // Vorig seizoen: de Elfde van de elfde (vaste datum), een avond met bus, deadline, doelgroep en plekken, en de Optocht.
  psql(`
    insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status)
    values ('${elfde}', '${j}-11-11', '11:11', '23:00', 'Marktplein', 'gepubliceerd'),
           ('${optocht}', '${j + 1}-02-07', '13:00', '17:00', 'Dorp', 'gepubliceerd');
    insert into public.activiteiten (naam, datum, verzameltijd, starttijd, eindtijd, locatie, bus_vertrektijd, bus_locatie,
                                     notitie, afmeld_deadline, min_aanwezigen, status)
    values ('${avond}', '${j + 1}-01-22', '18:30', '20:00', '23:00', 'De Kuus', '18:45', 'Parkeerplaats Sporthal',
            'Neem een jas mee', timestamp '${j + 1}-01-20 18:00' at time zone 'Europe/Amsterdam', 13, 'gepubliceerd');
    insert into public.rol_slots (activiteit_id, rol_type)
      select a.id, r.rol from public.activiteiten a,
             (values ('eindverantwoordelijke'), ('tapper'), ('tapper'), ('drankhaler')) r(rol)
       where a.naam = '${avond}';
    insert into public.activiteit_groep (activiteit_id, groep_id)
      select a.id, g.id from public.activiteiten a, public.groepen g where a.naam = '${avond}' and g.naam = 'Dames';
  `);
});

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Kopie % ${lopende}`);
  for (const uid of aangemaakt.splice(0)) {
    psql(`delete from public.wijzigingen_log where omschrijving like 'E2E Kopie % ${lopende}%';`);
    psql(`delete from public.bulk_aanmaken where door_lid_id = '${lidIdVan(uid)}';`);
    await ruimLidOp(uid);
  }
});

async function naarKopieerscherm(page: Page, j: number): Promise<void> {
  aangemaakt.push(await logInAlsBeheerder(page));
  await page.goto('/beheer/activiteiten/bulk');
  await expect(page.getByRole('heading', { level: 1, name: 'Meerdere activiteiten aanmaken' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Excel-bestand importeren/ })).toBeVisible();
  await page.getByRole('link', { name: /Vorig seizoen kopiëren/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vorig seizoen kopiëren' })).toBeVisible();
  const optie = page.locator('#kopie-seizoen option', { hasText: `Vastelaovend ${j}/${j + 1}` });
  await page.getByLabel('Seizoen', { exact: true }).selectOption((await optie.getAttribute('value')) ?? '');
}

test('een seizoen kopiëren: alles schuift mee, 11 november blijft staan, en het wordt een concept met lege plekken', async ({
  page,
}, info) => {
  const j = beginjaar(info.project.name);
  await naarKopieerscherm(page, j);

  // De Optocht is de activiteit met de bekende datum (de naam bevat "optocht"), dus die staat al gekozen.
  await expect(page.getByLabel('Activiteit met bekende datum')).toHaveValue(
    psql(`select id from public.activiteiten where naam = '${optocht}';`).trim(),
  );
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Een datum in hetzelfde seizoen is geen nieuw seizoen.
  await page.getByLabel(/valt dit seizoen op/).fill(`27-02-${j + 1}`);
  await page.getByRole('button', { name: 'Controleren' }).click();
  await expect(
    page.getByText('Kies een datum in een later seizoen dan het seizoen dat je kopieert.'),
  ).toBeVisible();

  await page.getByLabel(/valt dit seizoen op/).fill(`27-02-${j + 2}`);
  await page.getByRole('button', { name: 'Controleren' }).click();

  // Het controlescherm: drie regels op nieuwe datum, de vaste datum als aparte regel, en wat het vorige seizoen was.
  await expect(page.getByRole('heading', { level: 2, name: 'Controleer de activiteiten' })).toBeVisible();
  await expect(page.getByLabel('Datum')).toHaveCount(3);
  await expect(page.getByText('Vaste datum: elk jaar 11 november')).toBeVisible();
  await expect(page.getByText(new RegExp(`Vorig seizoen: .* ${j + 1}`))).toHaveCount(2);
  await expect(page.getByText('3 concepten', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // De Elfde van de elfde laat de beheerder weg: twee concepten.
  const elfdeRegel = page.getByRole('listitem').filter({ hasText: elfde });
  await elfdeRegel.getByRole('button', { name: 'Niet meenemen' }).click();
  await expect(page.getByText('2 concepten', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '2 concepten aanmaken' }).click();
  await expect(page).toHaveURL(/\/beheer\?aangemaakt=2$/);

  // De database: de avond verschoven met alles erbij, de plekken leeg, het vorige seizoen onveranderd.
  const nieuweAvondDatum = `${j + 2}-02-11`;
  const rij = (naam: string, datum: string, kolommen: string): string =>
    psql(
      `select ${kolommen} from public.activiteiten where naam = '${naam}' and datum = '${datum}' and status = 'concept';`,
    ).trim();
  expect(
    rij(
      avond,
      nieuweAvondDatum,
      `verzameltijd::text || '|' || starttijd::text || '|' || eindtijd::text || '|' || locatie || '|' || bus_vertrektijd::text || '|' || bus_locatie || '|' || notitie || '|' || min_aanwezigen::text || '|' || (afmeld_deadline at time zone 'Europe/Amsterdam')::text`,
    ),
  ).toBe(
    `18:30:00|20:00:00|23:00:00|De Kuus|18:45:00|Parkeerplaats Sporthal|Neem een jas mee|13|${j + 2}-02-09 18:00:00`,
  );
  expect(rij(optocht, `${j + 2}-02-27`, 'locatie')).toBe('Dorp');
  expect(
    psql(`select count(*) from public.activiteiten where naam = '${elfde}' and status = 'concept';`).trim(),
  ).toBe('0');

  const nieuweAvond = `(select id from public.activiteiten where naam = '${avond}' and datum = '${nieuweAvondDatum}')`;
  expect(
    psql(
      `select rol_type || ':' || count(*) from public.rol_slots where activiteit_id = ${nieuweAvond} and bezetter_id is null group by rol_type order by rol_type;`,
    )
      .trim()
      .split('\n'),
  ).toEqual(['drankhaler:1', 'eindverantwoordelijke:1', 'tapper:2']);
  expect(
    psql(
      `select g.naam from public.activiteit_groep ag join public.groepen g on g.id = ag.groep_id where ag.activiteit_id = ${nieuweAvond};`,
    ).trim(),
  ).toBe('Dames');
  expect(
    psql(
      `select count(*) from public.activiteiten where naam = '${avond}' and datum = '${j + 1}-01-22' and status = 'gepubliceerd';`,
    ).trim(),
  ).toBe('1');
});

test('11 november komt in het beginjaar van het nieuwe seizoen, en een datum is per regel aan te passen', async ({
  page,
}, info) => {
  const j = beginjaar(info.project.name);
  await naarKopieerscherm(page, j);
  await page.getByLabel(/valt dit seizoen op/).fill(`27-02-${j + 2}`);
  await page.getByRole('button', { name: 'Controleren' }).click();

  // De Elfde van de elfde staat op 11-11 van het beginjaar van het nieuwe seizoen.
  await expect(page.getByLabel('Datum').first()).toHaveValue(`11-11-${j + 1}`);

  // Een kapotte datum blokkeert het aanmaken, een goede maakt het weer vrij.
  const eerste = page.getByLabel('Datum').first();
  await eerste.fill(`31-02-${j + 2}`);
  await expect(page.getByText('Vul een datum in, bijvoorbeeld 11-02-2028.')).toBeVisible();
  await expect(page.getByRole('button', { name: /concepten aanmaken$/ })).toBeDisabled();
  await eerste.fill(`12-11-${j + 1}`);
  await expect(page.getByRole('button', { name: '3 concepten aanmaken' })).toBeEnabled();
});
