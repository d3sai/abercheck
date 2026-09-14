import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { EnvironmentVariables } from '../config/env.validation';
import type { TelegramLoginDto } from './dto/telegram-login.dto';

const MAX_AGE_SECONDS = 2 * 60;
const CLOCK_SKEW_SECONDS = 60;

type Field = [string, string | number];

/** https://core.telegram.org/widgets/login#checking-authorization */
@Injectable()
export class TelegramLoginVerifier {
  private readonly secret: Buffer;
  /** Hashes of logins already accepted, until they expire anyway. In memory: one app instance. */
  private readonly used = new Map<string, number>();

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.secret = createHash('sha256')
      .update(config.get('TELEGRAM_BOT_TOKEN', { infer: true }))
      .digest();
  }

  verify({ hash, ...data }: TelegramLoginDto, now = Date.now()): boolean {
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

  // Each signed login works once, so a callback URL left in history or logs can't be replayed.
  private consume(hash: string, expiresAt: number, now: number): boolean {
    for (const [key, expiry] of this.used) {
      if (expiry <= now) {
        this.used.delete(key);
      }
    }
    if (this.used.has(hash)) {
      return false;
    }
    this.used.set(hash, expiresAt);
    return true;
  }
}
