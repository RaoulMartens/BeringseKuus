// Gedeeld door de tests in het Playwright-project "database": rechtstreeks SQL draaien in de container van de lokale
// Supabase, als postgres. Geen browser en geen pakket erbij: `docker exec` en psql zitten er al.
import { execFileSync } from 'node:child_process';

const container = execFileSync(
  'docker',
  ['ps', '--filter', 'name=supabase_db_ledenplatform', '--format', '{{.Names}}'],
  { encoding: 'utf8' },
)
  .split('\n')[0]
  ?.trim();
if (!container) throw new Error('de lokale Supabase draait niet (npm run supabase:start)');

export const PSQL = [
  'exec',
  '-i',
  container,
  'psql',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
];

/** Draait SQL als postgres en geeft de uitvoer terug. */
export function psql(sql: string): string {
  return execFileSync('docker', [...PSQL, '-t', '-A'], { input: sql, encoding: 'utf8' });
}
