import type { Order, OrderStatus, Prisma, Refund } from '../../generated/prisma/client';

export interface Initiator {
  telegramId: bigint;
  name: string;
}

export interface RefundRecorded {
  refund: Refund;
  order: Order;
  previousStatus: OrderStatus;
  amountPaid: Prisma.Decimal;
}

export interface OrderCancelled {
  order: Order;
  previousStatus: OrderStatus;
  initiator: Initiator;
}

export const RefundEvents = {
  Recorded: 'refund.recorded',
  OrderCancelled: 'order.cancelled',
} as const;
