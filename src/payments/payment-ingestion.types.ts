import type { Order, OrderStatus, Payment, Prisma } from '../generated/prisma/client';

/** Платіж прив'язано до замовлення, статус замовлення перераховано. */
export interface PaymentRecorded {
  kind: 'recorded';
  payment: Payment;
  order: Order;
  previousStatus: OrderStatus;
  amountPaid: Prisma.Decimal;
}

/** Замовлення не визначено — платіж чекає на ручну прив'язку адміністратором. */
export interface PaymentUnmatched {
  kind: 'unmatched';
  payment: Payment;
}

/** Цю транзакцію вже обробляли — нічого не змінено, повторних сповіщень немає. */
export interface PaymentDuplicate {
  kind: 'duplicate';
  payment: Payment;
}

export type IngestionResult = PaymentRecorded | PaymentUnmatched | PaymentDuplicate;

/** Події для сповіщень (крок 3): надсилаються лише після коміту транзакції. */
export const PaymentEvents = {
  Recorded: 'payment.recorded',
  Unmatched: 'payment.unmatched',
} as const;
