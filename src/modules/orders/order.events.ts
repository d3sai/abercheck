import type { Order } from '../../generated/prisma/client';

export interface OrderCreated {
  order: Order;
}

export const OrderEvents = {
  Created: 'order.created',
} as const;
