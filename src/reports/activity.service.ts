import { Injectable } from '@nestjs/common';
import type { OrderStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ActivityKind = 'ORDER_CREATED' | 'PAYMENT' | 'UNMATCHED_PAYMENT' | 'REFUND';

export interface Activity {
  kind: ActivityKind;
  at: Date;
  orderNumber: string | null;
  amount: Prisma.Decimal;
  /** Current status of the order the event belongs to. */
  status: OrderStatus | null;
  /** Client, payer or refund initiator, depending on the kind. */
  who: string | null;
}

const newestFirst = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
const orderRef = { select: { orderNumber: true, status: true } };

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async recent(limit: number, managerId?: number): Promise<Activity[]> {
    const ofManager = managerId === undefined ? {} : { order: { managerId } };
    const [orders, payments, refunds] = await Promise.all([
      this.prisma.order.findMany({ where: { managerId }, orderBy: newestFirst, take: limit }),
      this.prisma.payment.findMany({
        where: ofManager,
        include: { order: orderRef },
        orderBy: newestFirst,
        take: limit,
      }),
      this.prisma.refund.findMany({
        where: ofManager,
        include: { order: orderRef },
        orderBy: newestFirst,
        take: limit,
      }),
    ]);

    const activity: Activity[] = [
      ...orders.map((order) => ({
        kind: 'ORDER_CREATED' as const,
        at: order.createdAt,
        orderNumber: order.orderNumber,
        amount: order.amountDue,
        status: order.status,
        who: order.clientName,
      })),
      ...payments.map((payment) => ({
        kind: payment.order ? ('PAYMENT' as const) : ('UNMATCHED_PAYMENT' as const),
        at: payment.createdAt,
        orderNumber: payment.order?.orderNumber ?? null,
        amount: payment.amount,
        status: payment.order?.status ?? null,
        who: payment.payerName,
      })),
      ...refunds.map((refund) => ({
        kind: 'REFUND' as const,
        at: refund.createdAt,
        orderNumber: refund.order.orderNumber,
        amount: refund.amount,
        status: refund.order.status,
        who: refund.initiatedByName,
      })),
    ];
    return activity.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
  }
}
