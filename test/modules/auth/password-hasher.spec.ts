import { hashPassword, verifyPassword } from '../../../src/modules/auth/password-hasher';

describe('password hasher', () => {
  it('should verify the password it hashed', async () => {
    const hash = await hashPassword('correct horse');

    await expect(verifyPassword('correct horse', hash)).resolves.toBe(true);
  });

  it('should reject a different password', async () => {
    const hash = await hashPassword('correct horse');

    await expect(verifyPassword('correct horsE', hash)).resolves.toBe(false);
  });

  it('should salt every hash and record the scrypt parameters', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);

    expect(first).not.toBe(second);
    expect(first).toMatch(/^scrypt\$32768\$8\$1\$[\w+/=]+\$[\w+/=]+$/);
  });

  it.each(['', 'bcrypt$10$abc', 'scrypt$32768$8$1$c2FsdA==', 'scrypt$32768$8$1$c2FsdA==$a2V5'])(
    'should reject the malformed hash %p',
    async (stored) => {
      await expect(verifyPassword('any', stored)).resolves.toBe(false);
    },
  );
});
