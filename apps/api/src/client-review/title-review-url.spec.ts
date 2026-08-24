import { buildTitleReviewUrl } from './title-review-url';

describe('buildTitleReviewUrl', () => {
  it('mantiene el token fuera de query y ruta', () => {
    expect(buildTitleReviewUrl('https://ihere.mood.pe/', 'token-seguro')).toBe(
      'https://ihere.mood.pe/revision-titulo#token-seguro',
    );
  });
});
