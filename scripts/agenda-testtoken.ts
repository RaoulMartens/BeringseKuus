// Het agenda-token voor de browsertests (proefroute 1). Het staat in deze publieke repository, dus het mag online
// nooit werken: scripts/controleer-online.ts probeert het na elke uitrol en eist een 404 (review PR11-03). Online
// staat een ander, geheim token bij Cloudflare (docs/hosting.md stap 11).
export const TEST_AGENDA_TOKEN = 'proeftoken-alleen-voor-de-browsertests-0123456789';
