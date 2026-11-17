// De bak bij de Bonte Avond (BA-8, R23): prins, adjudant, vorst en de elf raadsleden van de Raad van Elf, samen een lijst
// plekken die alleen de beheerder wijzigt. Zuivere logica zonder netwerk en zonder database; het beheerscherm (src/app/beheer/
// activiteiten/bak.tsx) en de ledenschermen gebruiken ze, en de database (activiteit_opslaan_met_bak) controleert alles opnieuw.

import { z } from 'zod';

/** De plaatsen in de bak, zoals de database ze kent (rol_slots.plek_label). */
export const BAK_LABELS = ['prins', 'adjudant', 'vorst', 'raadslid'] as const;
export type BakLabel = (typeof BAK_LABELS)[number];

/** Wat er bij een plek in het beheerscherm staat. */
export const BAK_PLEKNAAM: Record<BakLabel, string> = {
  prins: 'Prins',
  adjudant: 'Adjudant',
  vorst: 'Vorst',
  raadslid: 'Raadslid',
};

/** De kopjes in de bak, voor beheerder en leden: prins en adjudant bij elkaar, dan de vorst, dan de Raad van Elf. */
export const BAK_GROEPEN: readonly { titel: string; labels: readonly BakLabel[] }[] = [
  { titel: 'Prins en adjudant', labels: ['prins', 'adjudant'] },
  { titel: 'Vorst', labels: ['vorst'] },
  { titel: 'Raad van Elf', labels: ['raadslid'] },
];

export function isBakLabel(waarde: unknown): waarde is BakLabel {
  return typeof waarde === 'string' && (BAK_LABELS as readonly string[]).includes(waarde);
}

/** Een plek in de bak op het beheerscherm. */
export interface BakPlek {
  /** Leeg bij een plek die nog niet is opgeslagen. */
  slotId: string | null;
  label: BakLabel;
  bezetterId: string | null;
  /** Wie er stond toen de pagina werd geladen: de database vergelijkt dat met wat er nu staat (twee beheerders tegelijk). */
  verwacht: string | null;
}

/**
 * De bak zoals hij begint als de beheerder hem aanzet: een plek voor de prins, de adjudant en de vorst (leeg: die zijn geen
 * lid van de vereniging of nog niet bekend, de beheerder kiest ze) en een plek voor elk lid van de Raad van Elf, vooraf gevuld.
 */
export function beginBak(raadsleden: readonly string[]): BakPlek[] {
  const leeg = (label: BakLabel): BakPlek => ({ slotId: null, label, bezetterId: null, verwacht: null });
  return [
    leeg('prins'),
    leeg('adjudant'),
    leeg('vorst'),
    ...raadsleden.map((lid): BakPlek => ({
      slotId: null,
      label: 'raadslid',
      bezetterId: lid,
      verwacht: null,
    })),
  ];
}

/** De plekken van één kopje, in de volgorde waarin ze staan. */
export function plekkenVan(plekken: readonly BakPlek[], labels: readonly BakLabel[]): BakPlek[] {
  return plekken.filter((plek) => labels.includes(plek.label));
}

// ===== Naar de server =====

const UUID = z.uuid();

const PLEK = z
  .object({
    slot_id: UUID.nullable().optional(),
    label: z.enum(BAK_LABELS),
    bezetter_id: UUID.nullable(),
    verwachte_bezetter: UUID.nullable().optional(),
  })
  .strict();

const BAK = z
  .object({
    actief: z.boolean(),
    plekken: z.array(PLEK).max(30).optional(),
  })
  .strict();

/** Wat de server aan de database geeft (activiteit_opslaan_met_bak, p_bak). */
export interface BakInvoer {
  actief: boolean;
  plekken?: {
    slot_id?: string;
    label: BakLabel;
    bezetter_id: string | null;
    verwachte_bezetter: string | null;
  }[];
}

/** De bak als tekst voor het formulier (een verborgen veld). */
export function bakNaarTekst(actief: boolean, plekken: readonly BakPlek[]): string {
  if (!actief) return JSON.stringify({ actief: false });
  return JSON.stringify({
    actief: true,
    plekken: plekken.map((plek) => ({
      ...(plek.slotId ? { slot_id: plek.slotId } : {}),
      label: plek.label,
      bezetter_id: plek.bezetterId,
      verwachte_bezetter: plek.slotId ? plek.verwacht : null,
    })),
  });
}

/**
 * Wat de server uit het formulier leest: niets (het veld ontbreekt: de bak blijft zoals hij is), een bak, of 'ongeldig' bij iets
 * wat niet door het scherm gemaakt kan zijn. Wat het betekent, beslist de database.
 */
export function leesBak(waarde: FormDataEntryValue | null): BakInvoer | null | 'ongeldig' {
  if (waarde === null || waarde === '') return null;
  try {
    const uitkomst = BAK.safeParse(JSON.parse(String(waarde)));
    if (!uitkomst.success) return 'ongeldig';
    const { actief, plekken } = uitkomst.data;
    if (!actief) return { actief: false };
    return {
      actief: true,
      plekken: (plekken ?? []).map((plek) => ({
        ...(plek.slot_id ? { slot_id: plek.slot_id } : {}),
        label: plek.label,
        bezetter_id: plek.bezetter_id,
        verwachte_bezetter: plek.verwachte_bezetter ?? null,
      })),
    };
  } catch {
    return 'ongeldig';
  }
}

/** Een bak uit een eerder verstuurd formulier terug op het scherm (na een fout), met de plekken zoals de beheerder ze had. */
export function bakUitTekst(waarde: string | null): { actief: boolean; plekken: BakPlek[] } | null {
  const bak = leesBak(waarde);
  if (bak === null || bak === 'ongeldig') return null;
  return {
    actief: bak.actief,
    plekken: (bak.plekken ?? []).map((plek) => ({
      slotId: plek.slot_id ?? null,
      label: plek.label,
      bezetterId: plek.bezetter_id,
      verwacht: plek.verwachte_bezetter,
    })),
  };
}

// ===== Wat leden zien =====

/** Een bezette plek in de bak, zoals een lid hem leest. */
export interface BakNaam {
  label: BakLabel;
  lidId: string;
  naam: string;
}

export interface BakGroep {
  titel: string;
  namen: { lidId: string; naam: string; jij: boolean }[];
}

/** De bak per kopje, alleen kopjes waar iemand zit (een lege plek is voor een lid onzichtbaar, R13). */
export function groepeerBak(namen: readonly BakNaam[], eigenLidId: string): BakGroep[] {
  return BAK_GROEPEN.flatMap((groep) => {
    const leden = namen.filter((naam) => groep.labels.includes(naam.label));
    if (leden.length === 0) return [];
    // Binnen een kopje op de volgorde van de labels (prins voor adjudant), daarna zoals de database ze geeft.
    const gesorteerd = [...leden].sort(
      (a, b) => groep.labels.indexOf(a.label) - groep.labels.indexOf(b.label),
    );
    return [
      {
        titel: groep.titel,
        namen: gesorteerd.map((naam) => ({
          lidId: naam.lidId,
          naam: naam.naam,
          jij: naam.lidId === eigenLidId,
        })),
      },
    ];
  });
}
