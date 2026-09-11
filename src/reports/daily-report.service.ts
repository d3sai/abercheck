import { Injectable } from '@nestjs/common';
import { nextKyivDayStart } from '../common/kyiv-time';
import { OrderStatus, Prisma } from '../generated/prisma/client';
import { type OrderWithManager, type OrderWithPaid, OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

export type ReportBucket = OrderStatus | 'UNMATCHED';

export interface DailyReport {
  dayStart: Date;
  paymentsCount: number;
  totalAmount: Prisma.Decimal;
  byBucket: Record<ReportBucket, number>;
  refundsCount: number;
  refundsAmount: Prisma.Decimal;
}

const emptyBuckets = (): Record<ReportBucket, number> => ({
  AWAITING_PAYMENT: 0,
  PARTIALLY_PAID: 0,
  UNDERPAID: 0,
  PAID: 0,
  OVERPAID: 0,
  CANCELLED: 0,
  UNMATCHED: 0,
});

@Injectable()
export class DailyReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async build(dayStart: Date): Promise<DailyReport> {
    const window = { gte: dayStart, lt: nextKyivDayStart(dayStart) };
    const [payments, refunds] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paidAt: window },
        select: { amount: true, order: { select: { status: true } } },
      }),
      this.prisma.refund.aggregate({
        where: { createdAt: window },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const byBucket = emptyBuckets();
    let totalAmount = new Prisma.Decimal(0);
    for (const payment of payments) {
      byBucket[payment.order?.status ?? 'UNMATCHED'] += 1;
      totalAmount = totalAmount.plus(payment.amount);
    }

    return {
      dayStart,
      paymentsCount: payments.length,
      totalAmount,
      byBucket,
      refundsCount: refunds._count,
      refundsAmount: refunds._sum.amount ?? new Prisma.Decimal(0),
    };
  }

  async markUnderpaid(todayStart: Date): Promise<OrderWithPaid<OrderWithManager>[]> {
    const rows = await this.prisma.$queryRaw<{ id: number }[]>`
      UPDATE orders o
      SET status = ${OrderStatus.UNDERPAID}::order_status, updated_at = now()
      WHERE o.status = ${OrderStatus.PARTIALLY_PAID}::order_status
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.paid_at >= ${todayStart})
        AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.order_id = o.id AND r.created_at >= ${todayStart})
      RETURNING o.id`;
    return this.orders.findManyWithBalance(rows.map((row) => row.id));
  }
}
