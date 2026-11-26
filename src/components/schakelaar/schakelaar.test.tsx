// De schakelaar: een knop met role="switch" waarvan de naam uit verborgen tekst komt, met "Aan" of "Uit" zichtbaar ernaast.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Schakelaar } from './schakelaar';

const html = renderToStaticMarkup;

describe('Schakelaar', () => {
  it('is een knop met role switch en zegt of hij aan staat', () => {
    const aan = html(<Schakelaar naam="Bak bijhouden" aan onWissel={() => undefined} />);
    expect(aan).toMatch(/<button [^>]*type="button"[^>]*role="switch"[^>]*aria-checked="true"/);
    expect(aan).toContain('Aan');
    const uit = html(<Schakelaar naam="Bak bijhouden" aan={false} onWissel={() => undefined} />);
    expect(uit).toMatch(/aria-checked="false"/);
    expect(uit).toContain('Uit');
  });

  it('krijgt zijn naam uit verborgen tekst, niet uit een aria-label naast de zichtbare tekst', () => {
    const uit = html(<Schakelaar naam="Bak bijhouden bij deze activiteit" aan onWissel={() => undefined} />);
    expect(uit).not.toContain('aria-label');
    expect(uit).toContain('Bak bijhouden bij deze activiteit');
  });
});
