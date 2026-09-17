import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { EnvironmentVariables } from '../../common/config/env.validation';
import { isUniqueViolation } from '../../common/prisma/prisma-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { TelegramLoginDto } from './dto/telegram-login.dto';

const MAX_AGE_SECONDS = 2 * 60;
const CLOCK_SKEW_SECONDS = 60;

type Field = [string, string | number];

@Injectable()
export class TelegramLoginVerifier {
  private readonly secret: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = createHash('sha256')
      .update(config.get('TELEGRAM_BOT_TOKEN', { infer: true }))
      .digest();
  }

  async verify({ hash, ...data }: TelegramLoginDto, now = Date.now()): Promise<boolean> {
    const age = now / 1000 - data.auth_date;
    if (age < -CLOCK_SKEW_SECONDS || age > MAX_AGE_SECONDS) {
      return false;
    }

    const fields: Record<string, string | number | undefined> = data;
    const checkString = Object.entries(fields)
      .filter((field): field is Field => field[1] !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const expected = createHmac('sha256', this.secret).update(checkString).digest();
    const provided = Buffer.from(hash, 'hex');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return false;
    }
    return this.consume(hash, (data.auth_date + MAX_AGE_SECONDS + CLOCK_SKEW_SECONDS) * 1000, now);
  }

  private async consume(hash: string, expiresAt: number, now: number): Promise<boolean> {
    await this.prisma.telegramLoginHash.deleteMany({
      where: { expiresAt: { lte: new Date(now) } },
    });
    try {
      await this.prisma.telegramLoginHash.create({
        data: { hash, expiresAt: new Date(expiresAt) },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }
}
