// De zescijferige code van een authenticator-app (RFC 6238: HMAC-SHA1, 30 seconden, 6 cijfers), voor de tests. Supabase
// geeft bij het inschrijven van een app de geheime sleutel in base32; een test die de app speelt rekent hiermee de code uit.
import { createHmac } from 'node:crypto';

const ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function leesBase32(tekst: string): Buffer {
  let bits = '';
  for (const teken of tekst.replace(/=+$/, '').toUpperCase()) {
    const waarde = ALFABET.indexOf(teken);
    if (waarde < 0) throw new Error('de geheime sleutel is geen base32');
    bits += waarde.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** De code voor het huidige tijdvak van 30 seconden, of (periodes ≠ 0) een eerder of later vak. */
export function totpCode(geheim: string, periodes = 0, nu: Date = new Date()): string {
  const teller = Buffer.alloc(8);
  teller.writeBigUInt64BE(BigInt(Math.floor(nu.getTime() / 30000) + periodes));
  const hash = createHmac('sha1', leesBase32(geheim)).update(teller).digest();
  const start = (hash[hash.length - 1] ?? 0) & 15;
  const getal =
    (((hash[start] ?? 0) & 127) << 24) |
    ((hash[start + 1] ?? 0) << 16) |
    ((hash[start + 2] ?? 0) << 8) |
    (hash[start + 3] ?? 0);
  return String(getal % 1_000_000).padStart(6, '0');
}
