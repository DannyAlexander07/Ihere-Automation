import { buildReviewUrl } from './review-url';

describe('buildReviewUrl', () => {
  it('mantiene el token fuera de la ruta y de la consulta registrables', () => {
    const token = 'A'.repeat(43);
    const reviewUrl = new URL(buildReviewUrl('https://ihere.mood.pe/', token));

    expect(reviewUrl.pathname).toBe('/revision');
    expect(reviewUrl.search).toBe('');
    expect(reviewUrl.hash).toBe(`#${token}`);
    expect(
      `${reviewUrl.origin}${reviewUrl.pathname}${reviewUrl.search}`,
    ).not.toContain(token);
  });
});
