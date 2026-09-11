import type { OrderStatus } from '../generated/prisma/client';

export const STATUS_LABELS: Record<OrderStatus, { icon: string; name: string }> = {
  AWAITING_PAYMENT: { icon: '🟡', name: 'Очікується оплата' },
  PARTIALLY_PAID: { icon: '🔵', name: 'Часткова оплата' },
  UNDERPAID: { icon: '🔴', name: 'Недоплата' },
  PAID: { icon: '🟢', name: 'Оплачено' },
  OVERPAID: { icon: '🟠', name: 'Переплата' },
  CANCELLED: { icon: '❌', name: 'Скасовано' },
};

export function statusLabel(status: OrderStatus): string {
  const { icon, name } = STATUS_LABELS[status];
  return `${icon} ${name}`;
}
