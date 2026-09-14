import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ManagerRole } from '../generated/prisma/client';
import { type AuthenticatedRequest, ROLES_KEY } from './auth.decorators';
import { AuthErrors } from './auth.errors';
import { AuthService } from './auth.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
    const manager = scheme === 'Bearer' && token ? await this.auth.authenticate(token) : null;
    if (!manager) {
      throw AuthErrors.sessionInvalid();
    }

    const roles = this.reflector.getAllAndOverride<ManagerRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(manager.role)) {
      throw AuthErrors.forbidden();
    }

    request.manager = manager;
    return true;
  }
}
