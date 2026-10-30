import type { Page } from '@playwright/test';

// Normen uit bouwgids 14.3: WCAG 2.2 niveau AA. axe vindt niet alles; het toetsenbord en een echte telefoon
// worden per fase ook met de hand doorlopen (14.6).
export const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Wacht tot de pagina stilstaat voordat axe meet. Na een klik staat de muis nog op de knop, en een knop kleurt in 0,12 s
 * naar zijn hoverkleur: axe meet dan een tussenkleur (4,42:1 op een knop die in beide eindstanden ruim voldoet).
 */
export async function wachtTotStil(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.evaluate(() => Promise.all(document.getAnimations().map((animatie) => animatie.finished)));
}
