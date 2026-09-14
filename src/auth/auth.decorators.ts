import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Manager, ManagerRole } from '../generated/prisma/client';

export const ROLES_KEY = 'roles';

export interface AuthenticatedRequest extends Request {
  manager: Manager;
}

export const Roles = (...roles: ManagerRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentManager = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Manager =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().manager,
);
