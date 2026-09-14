import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';

const SCHEME = 'scrypt';
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;

function derive(password: string, salt: Buffer, length: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      length,
      { ...options, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, PARAMS);
  return [
    SCHEME,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== SCHEME || !n || !r || !p || !salt || !key) {
    return false;
  }
  const expected = Buffer.from(key, 'base64');
  if (expected.length !== KEY_LENGTH) {
    return false;
  }
  const actual = await derive(password, Buffer.from(salt, 'base64'), KEY_LENGTH, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}
