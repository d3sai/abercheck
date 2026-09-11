import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { EnvironmentVariables } from '../../config/env.validation';

export const API_KEY_HEADER = 'x-api-key';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Пускає лише сервіс-джерело платежів, який знає EXTERNAL_API_KEY. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.expected = digest(config.get('EXTERNAL_API_KEY', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const provided = context.switchToHttp().getRequest<Request>().header(API_KEY_HEADER);

    // Порівнюємо хеші однакової довжини — timingSafeEqual не видає довжину ключа.
    if (!provided || !timingSafeEqual(digest(provided), this.expected)) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}
