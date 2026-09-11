import type { OrderStatus } from '../../generated/prisma/client';
import type { IngestionResult } from '../payment-ingestion.types';

/** Контракт відповіді POST /api/payments. */
export interface PaymentResponse {
  /** recorded — прив'язано; unmatched — чекає ручної перевірки; already_processed — дубль. */
  result: 'recorded' | 'unmatched' | 'already_processed';
  payment_id: number;
  order_number: string | null;
  order_status: OrderStatus | null;
}

export function toPaymentResponse(result: IngestionResult): PaymentResponse {
  switch (result.kind) {
    case 'recorded':
      return {
        result: 'recorded',
        payment_id: result.payment.id,
        order_number: result.order.orderNumber,
        order_status: result.order.status,
      };
    case 'unmatched':
      return {
        result: 'unmatched',
        payment_id: result.payment.id,
        order_number: result.payment.reportedOrderNumber,
        order_status: null,
      };
    case 'duplicate':
      return {
        result: 'already_processed',
        payment_id: result.payment.id,
        order_number: result.payment.reportedOrderNumber,
        order_status: null,
      };
  }
}
