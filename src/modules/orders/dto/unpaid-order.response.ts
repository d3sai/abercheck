import type { OrderStatus } from '../../../generated/prisma/client';
import type { OrderWithPaid } from '../orders.service';

export interface UnpaidOrderResponse {
  order_number: string;
  client_name: string;
  invoice_number: string | null;
  amount_due: string;
  amount_paid: string;
  amount_remaining: string;
  status: OrderStatus;
  created_at: string;
}

export function toUnpaidOrderResponse({ order, amountPaid }: OrderWithPaid): UnpaidOrderResponse {
  return {
    order_number: order.orderNumber,
    client_name: order.clientName,
    invoice_number: order.invoiceNumber,
    amount_due: order.amountDue.toFixed(2),
    amount_paid: amountPaid.toFixed(2),
    amount_remaining: order.amountDue.minus(amountPaid).toFixed(2),
    status: order.status,
    created_at: order.createdAt.toISOString(),
  };
}
