import type { Order, OrderStatus, Payment, Prisma } from '../../generated/prisma/client';

export interface PaymentRecorded {
  kind: 'recorded';
  payment: Payment;
  order: Order;
  previousStatus: OrderStatus;
  amountPaid: Prisma.Decimal;
}

export interface PaymentUnmatched {
  kind: 'unmatched';
  payment: Payment;
}

export interface PaymentDuplicate {
  kind: 'duplicate';
  payment: Payment;
}

export type IngestionResult = PaymentRecorded | PaymentUnmatched | PaymentDuplicate;

export const PaymentEvents = {
  Recorded: 'payment.recorded',
  Unmatched: 'payment.unmatched',
} as const;
