import { createHash, createHmac, randomUUID } from 'node:crypto';

export type RecoverableReviewKind =
  'note' | 'title' | 'title-package' | 'note-package';

export function createRecoverableReviewCredentials(
  kind: RecoverableReviewKind,
  rootSecret: string,
) {
  const id = randomUUID();
  const token = recoverableReviewToken(kind, id, rootSecret);
  return { id, token, tokenHash: hashReviewToken(token) };
}

export function recoverableReviewToken(
  kind: RecoverableReviewKind,
  id: string,
  rootSecret: string,
) {
  const dedicatedKey = createHmac('sha256', rootSecret)
    .update('ihere:review-link-token:v1')
    .digest();
  return createHmac('sha256', dedicatedKey)
    .update(`${kind}:${id}`)
    .digest('base64url');
}

export function hashReviewToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function isRecoverableReviewToken(
  kind: RecoverableReviewKind,
  id: string,
  tokenHash: string,
  rootSecret: string,
) {
  return (
    hashReviewToken(recoverableReviewToken(kind, id, rootSecret)) === tokenHash
  );
}
