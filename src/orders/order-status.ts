import { OrderStatus, Prisma } from '../generated/prisma/client';

/** Замовлення, які ще чекають грошей і які віддаємо сервісу-джерелу для пошуку платежів. */
export const UNPAID_STATUSES: OrderStatus[] = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PARTIALLY_PAID,
  OrderStatus.UNDERPAID,
];

/**
 * Статус після нового платежу (розділ 7 ТЗ). Різниця рахується точно до копійки, без порогів.
 *
 * Нестача завжди дає PARTIALLY_PAID — чекаємо на решту (напр. другий переказ на інший ФОП).
 * UNDERPAID виставляє лише щоденна перевірка, якщо доплата так і не надійшла; нова часткова
 * доплата повертає замовлення в PARTIALLY_PAID. Скасоване замовлення свій статус не змінює.
 */
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
