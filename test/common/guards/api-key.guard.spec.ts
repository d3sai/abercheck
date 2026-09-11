import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../../src/config/env.validation';
import { ApiKeyGuard } from '../../../src/common/guards/api-key.guard';

const KEY = 'k'.repeat(32);

const contextWithKey = (key?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ header: (name: string) => (name === 'x-api-key' ? key : undefined) }),
    }),
  }) as unknown as ExecutionContext;

describe('ApiKeyGuard', () => {
  const config = { get: () => KEY } as unknown as ConfigService<EnvironmentVariables, true>;
  const guard = new ApiKeyGuard(config);

  it('should allow a request with the configured key', () => {
    expect(guard.canActivate(contextWithKey(KEY))).toBe(true);
  });

  it.each([undefined, '', 'wrong', `${KEY}x`])('should reject key %p', (key) => {
    expect(() => guard.canActivate(contextWithKey(key))).toThrow(UnauthorizedException);
  });
});
