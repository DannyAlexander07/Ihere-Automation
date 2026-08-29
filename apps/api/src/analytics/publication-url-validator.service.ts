import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PublicationUrlValidationStatus } from '../generated/prisma/client';

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 512_000;
const REQUEST_TIMEOUT_MS = 8_000;
const GROUP_PREFIX_LENGTH = 32;

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type PublicationUrlValidationResult = {
  validationStatus: PublicationUrlValidationStatus;
  httpStatus: number | null;
  resolvedUrl: string | null;
  canonicalUrl: string | null;
  redirectCount: number;
  validationMessage: string;
  validationCheckedAt: Date;
};

export type PublicationGroupingInput = {
  id: string;
  url: string;
  resolvedUrl: string | null;
  canonicalUrl: string | null;
};

@Injectable()
export class PublicationUrlValidatorService {
  validate(url: string, configuredSite: string | null) {
    return validatePublicationUrl(url, configuredSite);
  }
}

export async function validatePublicationUrl(
  value: string,
  configuredSite: string | null,
  fetcher: Fetcher = globalThis.fetch,
): Promise<PublicationUrlValidationResult> {
  const checkedAt = new Date();
  const initialUrl = safeUrl(value);
  if (!initialUrl || !belongsToSite(initialUrl, configuredSite)) {
    return validationResult(
      PublicationUrlValidationStatus.BROKEN,
      checkedAt,
      'La URL no pertenece al sitio configurado para el cliente.',
    );
  }

  let currentUrl = initialUrl;
  let redirectCount = 0;
  const visited = new Set<string>();

  try {
    while (redirectCount <= MAX_REDIRECTS) {
      const currentKey = comparableUrl(currentUrl);
      if (visited.has(currentKey)) {
        return validationResult(
          PublicationUrlValidationStatus.BROKEN,
          checkedAt,
          'La URL entra en un bucle de redirecciones.',
          null,
          currentUrl,
          null,
          redirectCount,
        );
      }
      visited.add(currentKey);

      const response = await fetcher(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent':
            'I-HERE-PublicationValidator/1.0 (+https://ihere.metasconlogrosefectivos.tech)',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) {
          return validationResult(
            PublicationUrlValidationStatus.BROKEN,
            checkedAt,
            `La respuesta ${response.status} no indica un destino de redirección.`,
            response.status,
            currentUrl,
            null,
            redirectCount,
          );
        }
        const nextUrl = safeUrl(new URL(location, currentUrl).toString());
        if (!nextUrl || !belongsToSite(nextUrl, configuredSite)) {
          return validationResult(
            PublicationUrlValidationStatus.REVIEW,
            checkedAt,
            'La URL redirige fuera del dominio configurado y requiere revisión humana.',
            response.status,
            nextUrl,
            null,
            redirectCount + 1,
          );
        }
        currentUrl = nextUrl;
        redirectCount += 1;
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel();
        return validationResult(
          PublicationUrlValidationStatus.BROKEN,
          checkedAt,
          `La URL respondió con estado HTTP ${response.status}.`,
          response.status,
          currentUrl,
          null,
          redirectCount,
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      const html =
        !contentType || /html|xhtml/i.test(contentType)
          ? await readBodyPrefix(response)
          : '';
      const canonicals = canonicalUrls(html, currentUrl);
      const canonicalUrl = canonicals[0] ?? null;

      if (canonicals.length > 1) {
        return validationResult(
          PublicationUrlValidationStatus.REVIEW,
          checkedAt,
          `La página declara ${canonicals.length} canonicales; Tecnología debe dejar uno solo.`,
          response.status,
          currentUrl,
          canonicalUrl,
          redirectCount,
        );
      }
      if (!canonicalUrl) {
        return validationResult(
          PublicationUrlValidationStatus.REVIEW,
          checkedAt,
          'La página responde correctamente, pero no declara un canonical verificable.',
          response.status,
          currentUrl,
          null,
          redirectCount,
        );
      }
      if (!belongsToSite(canonicalUrl, configuredSite)) {
        return validationResult(
          PublicationUrlValidationStatus.REVIEW,
          checkedAt,
          'El canonical apunta fuera del dominio configurado.',
          response.status,
          currentUrl,
          canonicalUrl,
          redirectCount,
        );
      }
      if (!isArticleBlogUrl(canonicalUrl)) {
        return validationResult(
          PublicationUrlValidationStatus.REVIEW,
          checkedAt,
          'El canonical no apunta a un artículo del blog.',
          response.status,
          currentUrl,
          canonicalUrl,
          redirectCount,
        );
      }
      if (comparableUrl(canonicalUrl) !== comparableUrl(currentUrl)) {
        return validationResult(
          PublicationUrlValidationStatus.REVIEW,
          checkedAt,
          'La página responde, pero su canonical apunta a otra URL del blog.',
          response.status,
          currentUrl,
          canonicalUrl,
          redirectCount,
        );
      }

      return validationResult(
        redirectCount
          ? PublicationUrlValidationStatus.REDIRECTED
          : PublicationUrlValidationStatus.VALID,
        checkedAt,
        redirectCount
          ? `La URL termina correctamente en 200 después de ${redirectCount} redirección${redirectCount === 1 ? '' : 'es'}.`
          : 'La URL responde 200 y declara un canonical autorreferente.',
        response.status,
        currentUrl,
        canonicalUrl,
        redirectCount,
      );
    }

    return validationResult(
      PublicationUrlValidationStatus.BROKEN,
      checkedAt,
      `La URL supera el máximo de ${MAX_REDIRECTS} redirecciones permitidas.`,
      null,
      currentUrl,
      null,
      redirectCount,
    );
  } catch (error) {
    return validationResult(
      PublicationUrlValidationStatus.ERROR,
      checkedAt,
      error instanceof Error && error.name === 'TimeoutError'
        ? 'La comprobación excedió el tiempo de espera; se intentará nuevamente.'
        : 'No se pudo comprobar la URL; se intentará nuevamente.',
      null,
      currentUrl,
      null,
      redirectCount,
    );
  }
}

export function publicationCandidateGroupKeys(
  publications: PublicationGroupingInput[],
): Map<string, string | null> {
  const parents = publications.map((_, index) => index);
  const find = (index: number): number => {
    if (parents[index] !== index) parents[index] = find(parents[index]);
    return parents[index];
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  const identities = publications.map(candidateIdentity);
  const fingerprints = identities.map(slugFingerprint);

  for (let left = 0; left < publications.length; left += 1) {
    for (let right = left + 1; right < publications.length; right += 1) {
      if (
        comparableUrl(identities[left]) === comparableUrl(identities[right]) ||
        probableTruncatedVariant(fingerprints[left], fingerprints[right])
      ) {
        union(left, right);
      }
    }
  }

  const components = new Map<number, number[]>();
  publications.forEach((_, index) => {
    const root = find(index);
    components.set(root, [...(components.get(root) ?? []), index]);
  });

  const result = new Map<string, string | null>();
  for (const indexes of components.values()) {
    if (indexes.length === 1) {
      result.set(publications[indexes[0]].id, null);
      continue;
    }
    const seed = indexes
      .map((index) => comparableUrl(identities[index]))
      .toSorted()[0];
    const key = createHash('sha256')
      .update(`publication-group:${seed}`)
      .digest('hex')
      .slice(0, 32);
    indexes.forEach((index) => result.set(publications[index].id, key));
  }
  return result;
}

function validationResult(
  validationStatus: PublicationUrlValidationStatus,
  validationCheckedAt: Date,
  validationMessage: string,
  httpStatus: number | null = null,
  resolvedUrl: string | null = null,
  canonicalUrl: string | null = null,
  redirectCount = 0,
): PublicationUrlValidationResult {
  return {
    validationStatus,
    httpStatus,
    resolvedUrl,
    canonicalUrl,
    redirectCount,
    validationMessage,
    validationCheckedAt,
  };
}

async function readBodyPrefix(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let content = '';
  try {
    while (received < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
    return content;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function canonicalUrls(html: string, baseUrl: string): string[] {
  const values: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    const rel = attributeValue(tag, 'rel');
    if (
      !rel?.split(/\s+/u).some((value) => value.toLowerCase() === 'canonical')
    ) {
      continue;
    }
    const href = attributeValue(tag, 'href');
    if (!href) continue;
    const url = safeUrl(new URL(href, baseUrl).toString());
    if (
      url &&
      !values.some((item) => comparableUrl(item) === comparableUrl(url))
    ) {
      values.push(url);
    }
  }
  return values;
}

function attributeValue(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, 'iu'),
  );
  return match?.[1] ?? match?.[2] ?? null;
}

function candidateIdentity(publication: PublicationGroupingInput): string {
  if (publication.canonicalUrl && isArticleBlogUrl(publication.canonicalUrl)) {
    return publication.canonicalUrl;
  }
  if (publication.resolvedUrl && isArticleBlogUrl(publication.resolvedUrl)) {
    return publication.resolvedUrl;
  }
  return publication.url;
}

function probableTruncatedVariant(left: string, right: string): boolean {
  if (Math.min(left.length, right.length) < GROUP_PREFIX_LENGTH) return false;
  return left.startsWith(right) || right.startsWith(left);
}

function slugFingerprint(value: string): string {
  try {
    const path = decodedPathname(new URL(value).pathname);
    return (path.split('/').filter(Boolean).at(-1) ?? '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]/giu, '')
      .toLowerCase();
  } catch {
    return '';
  }
}

function isArticleBlogUrl(value: string): boolean {
  try {
    const segments = decodedPathname(new URL(value).pathname)
      .toLowerCase()
      .split('/')
      .filter(Boolean);
    const blogIndex = segments.indexOf('blog');
    if (blogIndex < 0 || !segments[blogIndex + 1]) return false;
    return ![
      'tag',
      'tags',
      'category',
      'author',
      'page',
      'search',
      'feed',
    ].includes(segments[blogIndex + 1]);
  } catch {
    return false;
  }
}

function belongsToSite(value: string, configuredSite: string | null): boolean {
  if (!configuredSite) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (configuredSite.startsWith('sc-domain:')) {
      const domain = configuredSite.slice('sc-domain:'.length).toLowerCase();
      return hostname === domain || hostname.endsWith(`.${domain}`);
    }
    return hostname === new URL(configuredSite).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function comparableUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    const pathname = decodedPathname(url.pathname)
      .replace(/\/+$/u, '')
      .toLocaleLowerCase('es-PE');
    return `${url.hostname.toLowerCase()}${pathname || '/'}`;
  } catch {
    return value.trim().toLocaleLowerCase('es-PE');
  }
}

function decodedPathname(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}
