import {
  createRecoverableReviewCredentials,
  hashReviewToken,
  isRecoverableReviewToken,
  recoverableReviewToken,
} from './recoverable-review-token';

describe('recoverable review tokens', () => {
  const secret = 'a-test-secret-with-more-than-thirty-two-characters';

  it('reconstruye el mismo token sin almacenarlo en texto plano', () => {
    const created = createRecoverableReviewCredentials('title-package', secret);
    const recovered = recoverableReviewToken(
      'title-package',
      created.id,
      secret,
    );

    expect(recovered).toBe(created.token);
    expect(recovered).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashReviewToken(recovered)).toBe(created.tokenHash);
    expect(
      isRecoverableReviewToken(
        'title-package',
        created.id,
        created.tokenHash,
        secret,
      ),
    ).toBe(true);
  });

  it('separa los tokens por tipo de revisión', () => {
    const id = 'f3471703-6273-4a5f-8363-bd97daec6ddd';
    expect(recoverableReviewToken('note', id, secret)).not.toBe(
      recoverableReviewToken('title', id, secret),
    );
  });
});
