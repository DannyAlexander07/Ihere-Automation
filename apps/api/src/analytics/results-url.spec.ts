import { buildResultsUrl } from './results-url';

describe('buildResultsUrl', () => {
  it('mantiene el token fuera de la consulta HTTP', () => {
    const url = buildResultsUrl('https://ihere.mood.pe/', 'token-secreto');
    expect(url).toBe('https://ihere.mood.pe/resultados#token-secreto');
    expect(new URL(url).search).toBe('');
  });
});
