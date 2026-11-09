// De rollen op één plek: hoe ze heten in een kop, in een zin en in een telling. De rollen staan in de tabel roltypen
// (BA-6); de beheerder kan er zelf een bijmaken ("Anders"), en dan is de naam die hij intypt ook de code. Voor de vaste
// rollen staan hier de woorden met de goede meervouden; een eigen rol krijgt zijn eigen naam en een telling in plekken
// ("2 garderobe-plekken"). Alles hier is zuivere logica zonder database.

interface Woorden {
  /** De kop boven de plekken en het label in de rolbezetting: "Tapper". */
  label: string;
  /** In een zin: "1 tapper indelen". */
  een: string;
  /** "2 tappers indelen". */
  meer: string;
  /** Wat er leeg is: "1 tapper-plek". */
  plek: string;
  plekken: string;
}

const VAST: Record<string, Woorden> = {
  eindverantwoordelijke: {
    label: 'Eindverantwoordelijke',
    een: 'eindverantwoordelijke',
    meer: 'eindverantwoordelijken',
    plek: 'eindverantwoordelijke-plek',
    plekken: 'eindverantwoordelijke-plekken',
  },
  bob: { label: 'BOB', een: 'BOB', meer: "BOB's", plek: 'BOB-plek', plekken: 'BOB-plekken' },
  tapper: { label: 'Tapper', een: 'tapper', meer: 'tappers', plek: 'tapper-plek', plekken: 'tapper-plekken' },
  buffet: {
    label: 'Buffet',
    een: 'buffet-plek',
    meer: 'buffet-plekken',
    plek: 'buffet-plek',
    plekken: 'buffet-plekken',
  },
  ober: { label: 'Ober', een: 'ober', meer: 'obers', plek: 'ober-plek', plekken: 'ober-plekken' },
  bonnenkassa: {
    label: 'Bonnenkassa',
    een: 'bonnenkassa-plek',
    meer: 'bonnenkassa-plekken',
    plek: 'bonnenkassa-plek',
    plekken: 'bonnenkassa-plekken',
  },
  werker: { label: 'Werker', een: 'werker', meer: 'werkers', plek: 'werker-plek', plekken: 'werker-plekken' },
  drankhaler: {
    label: 'Drankhaler',
    een: 'drankhaler',
    meer: 'drankhalers',
    plek: 'drankhaler-plek',
    plekken: 'drankhaler-plekken',
  },
  fotograaf: {
    label: 'Fotograaf',
    een: 'fotograaf',
    meer: 'fotografen',
    plek: 'fotograaf-plek',
    plekken: 'fotograaf-plekken',
  },
};

/** De volgorde op het scherm van een lid: de eindverantwoordelijke en de BOB eerst, dan het werk, een eigen rol daarna. */
const VOLGORDE = Object.keys(VAST);

/** De rollen die alleen het bestuur wijzigt: een lid kan ze niet overdragen (R4). Een eigen rol kan een lid wel overdragen. */
const NIET_RUILBAAR: readonly string[] = ['eindverantwoordelijke', 'bob', 'bak'];

/** Een vaste rol met een eigen code; al het andere is een rol die de beheerder heeft ingetypt. */
export function isVasteRol(code: string): boolean {
  return Object.hasOwn(VAST, code) || code === 'bak';
}

function woorden(code: string): Woorden {
  const vast = VAST[code];
  if (vast) return vast;
  const klein = code.toLowerCase();
  return {
    label: code,
    een: `${klein}-plek`,
    meer: `${klein}-plekken`,
    plek: `${klein}-plek`,
    plekken: `${klein}-plekken`,
  };
}

/** "Tapper", "BOB"; bij een eigen rol de naam zoals de beheerder hem intypte. */
export function rolLabel(code: string): string {
  return woorden(code).label;
}

/** De rol in een zin: "tapper", "BOB". */
export function rolInZin(code: string): string {
  const label = rolLabel(code);
  return label === 'BOB' ? label : label.toLowerCase();
}

/** "1 tapper", "2 tappers", "2 garderobe-plekken": voor een taak ("… indelen"). */
export function rolAantal(code: string, aantal: number): string {
  const w = woorden(code);
  return `${aantal} ${aantal === 1 ? w.een : w.meer}`;
}

/** "1 tapper-plek", "2 BOB-plekken": wat er nog leeg is. */
export function plekAantal(code: string, aantal: number): string {
  const w = woorden(code);
  return `${aantal} ${aantal === 1 ? w.plek : w.plekken}`;
}

/** Kan een lid deze dienst zelf overdragen (R4)? Dit spiegelt roltypen.ruilbaar_door_lid; de database blijft leidend. */
export function isRuilbaar(code: string): boolean {
  return code !== '' && !NIET_RUILBAAR.includes(code);
}

/** Sorteert rollen zoals een lid ze ziet: de vaste in hun volgorde, een eigen rol daarna op naam. */
export function vergelijkRollen(a: string, b: string): number {
  const ia = VOLGORDE.indexOf(a);
  const ib = VOLGORDE.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? VOLGORDE.length : ia) - (ib === -1 ? VOLGORDE.length : ib);
  return a.localeCompare(b, 'nl');
}
