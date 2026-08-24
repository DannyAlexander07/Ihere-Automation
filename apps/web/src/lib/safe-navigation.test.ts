import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safe-navigation';

describe('safeInternalPath', () => {
  it('conserva una ruta interna con consulta y fragmento', () => {
    expect(safeInternalPath('/automatizacion/notas?estado=QA#fila-2')).toBe(
      '/automatizacion/notas?estado=QA#fila-2',
    );
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\\\evil.example',
    '/%5C%5Cevil.example',
    '/%2e%2e//evil.example',
    '/.%2e//evil.example',
  ])('rechaza destinos externos o ambiguos: %s', (value) => {
    expect(safeInternalPath(value)).toBe('/inicio');
  });

  it('rechaza valores repetidos o ausentes', () => {
    expect(safeInternalPath(['/inicio', '/otra'])).toBe('/inicio');
    expect(safeInternalPath(undefined)).toBe('/inicio');
  });
});
