import { OrderStatus, Prisma } from '../../generated/prisma/client';

export const UNPAID_STATUSES: OrderStatus[] = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PARTIALLY_PAID,
  OrderStatus.UNDERPAID,
];

export function calculateOrderStatus(
  amountDue: Prisma.Decimal,
  amountPaid: Prisma.Decimal,
  current: OrderStatus,
): OrderStatus {
  if (current === OrderStatus.CANCELLED) {
    return current;
  }
  if (amountPaid.isZero()) {
    return OrderStatus.AWAITING_PAYMENT;
  }

  const diff = amountPaid.comparedTo(amountDue);
  if (diff === 0) {
    return OrderStatus.PAID;
  }
  return diff > 0 ? OrderStatus.OVERPAID : OrderStatus.PARTIALLY_PAID;
}
