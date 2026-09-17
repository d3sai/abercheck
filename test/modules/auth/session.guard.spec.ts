import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '../../../src/modules/auth/auth.decorators';
import type { AuthService } from '../../../src/modules/auth/auth.service';
import { SessionGuard } from '../../../src/modules/auth/session.guard';
import { ApiError } from '../../../src/common/api-error';
import { ManagerRole } from '../../../src/generated/prisma/client';

const openHandler = () => null;
const adminHandler = () => null;
Roles(ManagerRole.ADMIN)(adminHandler);

function contextFor(handler: () => null, authorization?: string) {
  const request: { manager?: unknown; header: (name: string) => string | undefined } = {
    header: (name) => (name === 'authorization' ? authorization : undefined),
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => Object,
  } as unknown as ExecutionContext;
  return { context, request };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return (error.getResponse() as { code: string }).code;
    }
    throw error;
  }
  throw new Error('Expected the guard to reject');
}

describe('SessionGuard', () => {
  const auth = { authenticate: jest.fn() };
  const guard = new SessionGuard(auth as unknown as AuthService, new Reflector());
  const manager = { id: 7, role: ManagerRole.MANAGER };

  afterEach(() => jest.resetAllMocks());

  it.each([undefined, 'token', 'Basic abc', 'Bearer'])(
    'should reject the authorization header %p',
    async (header) => {
      const { context } = contextFor(openHandler, header);

      await expect(failure(guard.canActivate(context))).resolves.toBe('SESSION_INVALID');
      expect(auth.authenticate).not.toHaveBeenCalled();
    },
  );

  it('should reject a token that does not resolve to an active manager', async () => {
    auth.authenticate.mockResolvedValue(null);

    await expect(
      failure(guard.canActivate(contextFor(openHandler, 'Bearer expired').context)),
    ).resolves.toBe('SESSION_INVALID');
  });

  it('should attach the manager to the request', async () => {
    auth.authenticate.mockResolvedValue(manager);
    const { context, request } = contextFor(openHandler, 'Bearer good');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(auth.authenticate).toHaveBeenCalledWith('good');
    expect(request.manager).toBe(manager);
  });

  it('should keep managers out of admin-only routes', async () => {
    auth.authenticate.mockResolvedValue(manager);

    await expect(
      failure(guard.canActivate(contextFor(adminHandler, 'Bearer good').context)),
    ).resolves.toBe('FORBIDDEN');
  });

  it('should let admins into admin-only routes', async () => {
    auth.authenticate.mockResolvedValue({ ...manager, role: ManagerRole.ADMIN });

    await expect(guard.canActivate(contextFor(adminHandler, 'Bearer good').context)).resolves.toBe(
      true,
    );
  });
});
