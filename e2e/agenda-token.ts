// Het agenda-token voor de browsertests (proefroute 1). Alleen voor de lokale Worker in de tests; online staat een
// ander, geheim token bij Cloudflare (docs/hosting.md). playwright.config.ts geeft dit token aan de Worker mee.
export const TEST_AGENDA_TOKEN = 'proeftoken-alleen-voor-de-browsertests-0123456789';
