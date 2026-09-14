import type { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import type { TelegramLoginDto } from '../../src/auth/dto/telegram-login.dto';
import { TelegramLoginVerifier } from '../../src/auth/telegram-login.verifier';
import type { EnvironmentVariables } from '../../src/config/env.validation';

const BOT_TOKEN = `123456789:${'A'.repeat(35)}`;
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

const configWith = (token: string) =>
  ({ get: () => token }) as unknown as ConfigService<EnvironmentVariables, true>;

function signed(fields: Omit<TelegramLoginDto, 'hash'>): TelegramLoginDto {
  const checkString = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort()
    .join('\n');
  const secret = createHash('sha256').update(BOT_TOKEN).digest();
  return { ...fields, hash: createHmac('sha256', secret).update(checkString).digest('hex') };
}

describe('TelegramLoginVerifier', () => {
  const fields = {
    id: 5000000000,
    first_name: 'Христина',
    username: 'khrystyna',
    auth_date: NOW / 1000 - 30,
  };
  let verifier: TelegramLoginVerifier;

  beforeEach(() => {
    verifier = new TelegramLoginVerifier(configWith(BOT_TOKEN));
  });

  it('should accept a fresh payload signed with the bot token', () => {
    expect(verifier.verify(signed(fields), NOW)).toBe(true);
  });

  it('should accept a signed payload only once', () => {
    const payload = signed(fields);

    expect(verifier.verify(payload, NOW)).toBe(true);
    expect(verifier.verify(payload, NOW + 1_000)).toBe(false);
  });

  it('should not let a rejected payload use up a valid one', () => {
    const payload = signed(fields);

    expect(verifier.verify({ ...payload, username: 'intruder' }, NOW)).toBe(false);
    expect(verifier.verify(payload, NOW)).toBe(true);
  });

  it('should reject a payload signed with another bot token', () => {
    const other = new TelegramLoginVerifier(configWith(`987654321:${'B'.repeat(35)}`));

    expect(other.verify(signed(fields), NOW)).toBe(false);
  });

  it.each([
    ['older than 2 minutes', NOW / 1000 - 121],
    ['from the future', NOW / 1000 + 120],
  ])('should reject a payload %s', (_case, authDate) => {
    expect(verifier.verify(signed({ ...fields, auth_date: authDate }), NOW)).toBe(false);
  });

  it('should reject a hash of the wrong length', () => {
    expect(verifier.verify({ ...signed(fields), hash: 'ab' }, NOW)).toBe(false);
  });
});
