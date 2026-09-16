import type { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import type { TelegramLoginDto } from '../../src/auth/dto/telegram-login.dto';
import { TelegramLoginVerifier } from '../../src/auth/telegram-login.verifier';
import type { EnvironmentVariables } from '../../src/config/env.validation';
import { Prisma } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';

const BOT_TOKEN = `123456789:${'A'.repeat(35)}`;
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

const configWith = (token: string) =>
  ({ get: () => token }) as unknown as ConfigService<EnvironmentVariables, true>;

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('already used', {
    code: 'P2002',
    clientVersion: 'test',
  });

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
  const used = new Set<string>();
  const telegramLoginHash = {
    deleteMany: jest.fn(),
    create: jest.fn((args: { data: { hash: string } }) => {
      if (used.has(args.data.hash)) {
        return Promise.reject(uniqueViolation());
      }
      used.add(args.data.hash);
      return Promise.resolve();
    }),
  };
  const prisma = { telegramLoginHash } as unknown as PrismaService;
  let verifier: TelegramLoginVerifier;

  beforeEach(() => {
    used.clear();
    telegramLoginHash.deleteMany.mockResolvedValue({ count: 0 });
    verifier = new TelegramLoginVerifier(prisma, configWith(BOT_TOKEN));
  });

  afterEach(() => jest.clearAllMocks());

  it('should accept a fresh payload signed with the bot token', async () => {
    await expect(verifier.verify(signed(fields), NOW)).resolves.toBe(true);
  });

  it('should accept a signed payload only once', async () => {
    const payload = signed(fields);

    await expect(verifier.verify(payload, NOW)).resolves.toBe(true);
    await expect(verifier.verify(payload, NOW + 1_000)).resolves.toBe(false);
  });

  it('should not let a rejected payload use up a valid one', async () => {
    const payload = signed(fields);

    await expect(verifier.verify({ ...payload, username: 'intruder' }, NOW)).resolves.toBe(false);
    await expect(verifier.verify(payload, NOW)).resolves.toBe(true);
  });

  it('should reject a payload signed with another bot token', async () => {
    const other = new TelegramLoginVerifier(prisma, configWith(`987654321:${'B'.repeat(35)}`));

    await expect(other.verify(signed(fields), NOW)).resolves.toBe(false);
  });

  it.each([
    ['older than 2 minutes', NOW / 1000 - 121],
    ['from the future', NOW / 1000 + 120],
  ])('should reject a payload %s', async (_case, authDate) => {
    await expect(verifier.verify(signed({ ...fields, auth_date: authDate }), NOW)).resolves.toBe(
      false,
    );
  });

  it('should reject a hash of the wrong length', async () => {
    await expect(verifier.verify({ ...signed(fields), hash: 'ab' }, NOW)).resolves.toBe(false);
  });

  it('should clear expired hashes before checking for a replay, so the table cannot grow forever', async () => {
    await verifier.verify(signed(fields), NOW);

    expect(telegramLoginHash.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: new Date(NOW) } },
    });
  });
});
