import { type Manager, ManagerRole, type Order } from '../../generated/prisma/client';
import type { Initiator } from '../refunds/refund.events';

export const isAdmin = (manager: Manager) => manager.role === ManagerRole.ADMIN;

export const ownOrdersOf = (manager: Manager): number | undefined =>
  isAdmin(manager) ? undefined : manager.id;

export const canAccessOrder = (manager: Manager, order: Order) =>
  isAdmin(manager) || order.managerId === manager.id;

export const initiatorOf = (manager: Manager): Initiator => ({
  telegramId: manager.telegramId,
  name: manager.name,
});
