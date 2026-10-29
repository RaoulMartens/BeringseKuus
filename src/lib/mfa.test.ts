import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BEHEERSTATUSSEN,
  CODE_GELDIG_UUR,
  leesBeheerstatus,
  normaliseerCode,
  routeVoorBeheerstatus,
} from './mfa';

describe('CODE_GELDIG_UUR', () => {
  it('is hetzelfde aantal uren als in de database', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261029110000_fase1_mfa.sql'), 'utf8');
    const uren = /extract\(epoch from now\(\)\)::bigint - (\d+) \* 3600/.exec(sql)?.[1];
    expect(Number(uren)).toBe(CODE_GELDIG_UUR);
  });
});

describe('leesBeheerstatus', () => {
  it('kent elke status van de database', () => {
    for (const status of BEHEERSTATUSSEN) expect(leesBeheerstatus(status)).toBe(status);
  });

  it('weigert al het andere, dus geen beheer bij een onverwacht antwoord', () => {
    for (const fout of [null, undefined, '', 'OK', 'ok ', 'admin', 42, {}, ['ok']]) {
      expect(leesBeheerstatus(fout), String(fout)).toBeNull();
    }
  });
});

describe('routeVoorBeheerstatus', () => {
  it('laat alleen ok door', () => {
    expect(routeVoorBeheerstatus('ok')).toBeNull();
    for (const status of BEHEERSTATUSSEN.filter((s) => s !== 'ok')) {
      expect(routeVoorBeheerstatus(status), status).toMatch(/^\//);
    }
  });

  it('geeft elke andere status een eigen scherm, behalve geen_lid dat naar het inloggen gaat', () => {
    const routes = BEHEERSTATUSSEN.map(routeVoorBeheerstatus).filter((r) => r !== null);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

describe('normaliseerCode', () => {
  it('accepteert zes cijfers, ook met een spatie in het midden', () => {
    expect(normaliseerCode('123456')).toBe('123456');
    expect(normaliseerCode(' 123 456 ')).toBe('123456');
    expect(normaliseerCode('000000')).toBe('000000');
  });

  it('weigert alles wat geen zes cijfers is', () => {
    for (const fout of ['', '12345', '1234567', 'abcdef', '12345a', '12-456', '１２３４５６', null, 123456]) {
      expect(normaliseerCode(fout), String(fout)).toBeNull();
    }
  });
});
