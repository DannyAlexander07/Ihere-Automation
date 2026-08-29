import { PublicationUrlValidationStatus } from '../generated/prisma/client';
import {
  publicationCandidateGroupKeys,
  validatePublicationUrl,
} from './publication-url-validator.service';

describe('validatePublicationUrl', () => {
  const site = 'https://www.adecco.com/es-pe/';

  it('acepta una URL 200 con canonical autorreferente', async () => {
    const url = 'https://www.adecco.com/es-pe/blog/articulo-valido';
    const fetcher = jest.fn(() =>
      Promise.resolve(
        htmlResponse(
          200,
          `<html><head><link rel="canonical" href="${url}"></head></html>`,
        ),
      ),
    );

    const result = await validatePublicationUrl(url, site, fetcher);

    expect(result).toMatchObject({
      validationStatus: PublicationUrlValidationStatus.VALID,
      httpStatus: 200,
      resolvedUrl: url,
      canonicalUrl: url,
      redirectCount: 0,
    });
  });

  it('bloquea un bucle de redirecciones aunque cambie la codificación', async () => {
    const url = 'https://www.adecco.com/es-pe/blog/selecci%C3%B3n';
    const fetcher = jest.fn(() =>
      Promise.resolve(
        new Response(null, {
          status: 301,
          headers: { location: '/es-pe/blog/selecci%c3%b3n' },
        }),
      ),
    );

    const result = await validatePublicationUrl(url, site, fetcher);

    expect(result.validationStatus).toBe(PublicationUrlValidationStatus.BROKEN);
    expect(result.validationMessage).toMatch(/bucle/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('envía a revisión una página con dos canonicales', async () => {
    const url = 'https://www.adecco.com/es-pe/blog/articulo';
    const fetcher = jest.fn(() =>
      Promise.resolve(
        htmlResponse(
          200,
          `<link rel="canonical" href="${url}"><link href="/es-pe/servicios/servicios-contactanos" rel="canonical">`,
        ),
      ),
    );

    const result = await validatePublicationUrl(url, site, fetcher);

    expect(result.validationStatus).toBe(PublicationUrlValidationStatus.REVIEW);
    expect(result.validationMessage).toMatch(/2 canonicales/i);
  });
});

describe('publicationCandidateGroupKeys', () => {
  it('agrupa canonicales coincidentes y variantes truncadas sin mezclar temas', () => {
    const canonical =
      'https://www.adecco.com/es-pe/blog/como-construir-una-marca-empleadora-solida-en-un-mercado-laboral-competitivo';
    const groups = publicationCandidateGroupKeys([
      {
        id: 'canonical-a',
        url: 'https://www.adecco.com/es-pe/blog/marca-variante-a',
        resolvedUrl: canonical,
        canonicalUrl: canonical,
      },
      {
        id: 'canonical-b',
        url: 'https://www.adecco.com/es-pe/blog/marca-variante-b',
        resolvedUrl: canonical,
        canonicalUrl: canonical,
      },
      {
        id: 'truncated-a',
        url: 'https://www.adecco.com/es-pe/blog/seleccion-especializada-como-encontrar-perfiles',
        resolvedUrl: null,
        canonicalUrl: null,
      },
      {
        id: 'truncated-b',
        url: 'https://www.adecco.com/es-pe/blog/seleccion-especializada-como-encontrar-perfiles-de-dificil-cobertura',
        resolvedUrl: null,
        canonicalUrl: null,
      },
      {
        id: 'independent',
        url: 'https://www.adecco.com/es-pe/blog/pago-de-planilla',
        resolvedUrl: null,
        canonicalUrl: null,
      },
    ]);

    expect(groups.get('canonical-a')).toBe(groups.get('canonical-b'));
    expect(groups.get('canonical-a')).not.toBeNull();
    expect(groups.get('truncated-a')).toBe(groups.get('truncated-b'));
    expect(groups.get('truncated-a')).not.toBeNull();
    expect(groups.get('independent')).toBeNull();
  });
});

function htmlResponse(status: number, html: string) {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
