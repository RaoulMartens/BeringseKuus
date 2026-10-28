// Alles gaat over https (review F0-05). Over http reizen een e-mailadres en een agendatoken onversleuteld, en een
// sessiecookie met Secure komt dan nooit terug: het lid lijkt in te loggen en staat daarna weer op /inloggen.
// Uitzondering: de eigen computer, waar `npm run dev` en de browsertests over http lopen.

/** Komt de aanvraag over een veilige verbinding (of van de eigen computer)? */
export function veiligeVerbinding(url: URL): boolean {
  return url.protocol === 'https:' || url.hostname === '127.0.0.1' || url.hostname === 'localhost';
}
