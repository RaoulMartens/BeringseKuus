import type { Page } from '@playwright/test';

/**
 * Naar Beheer, zoals een beheerder dat doet: op een groot scherm met de knop Beheer in de bovenbalk, op een telefoon (smaller dan
 * 700 px, waar de knop niet in de balk past) via het rondje naar Mijn account en daar de kaart Beheer.
 */
export async function gaNaarBeheer(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) > 700) {
    await page.getByRole('banner').getByRole('link', { name: 'Beheer' }).click();
  } else {
    await page.getByRole('link', { name: /^Mijn account \(/ }).click();
    await page.getByRole('link', { name: 'Naar Beheer' }).click();
  }
}
