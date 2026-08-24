import { buildTitlePackageReviewUrl } from './title-package-review-url';

describe('buildTitlePackageReviewUrl', () => {
  it('mantiene el token del paquete fuera de query y ruta', () => {
    expect(
      buildTitlePackageReviewUrl('https://ihere.mood.pe/', 'token-seguro'),
    ).toBe('https://ihere.mood.pe/revision-paquete-titulos#token-seguro');
  });
});
