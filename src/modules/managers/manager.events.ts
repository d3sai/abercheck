import type { Manager, ManagerStatus } from '../../generated/prisma/client';

export interface ManagerAccessChanged {
  manager: Manager;
  previousStatus: ManagerStatus;
}

export const ManagerEvents = {
  AccessChanged: 'manager.access-changed',
} as const;
