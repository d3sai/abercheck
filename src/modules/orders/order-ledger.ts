import { type Order, Prisma } from '../../generated/prisma/client';

export async function lockOrderByNumber(
  tx: Prisma.TransactionClient,
  orderNumber: string,
): Promise<Order | null> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM orders WHERE order_number = ${orderNumber} FOR UPDATE`;
  const id = rows[0]?.id;
  return id === undefined ? null : tx.order.findUnique({ where: { id } });
}

export async function lockOrderById(
  tx: Prisma.TransactionClient,
  id: number,
): Promise<Order | null> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
  return rows.length === 0 ? null : tx.order.findUnique({ where: { id } });
}

export async function netPaid(
  tx: Prisma.TransactionClient,
  orderId: number,
): Promise<Prisma.Decimal> {
  const [payments, refunds] = await Promise.all([
    tx.payment.aggregate({ where: { orderId }, _sum: { amount: true } }),
    tx.refund.aggregate({ where: { orderId }, _sum: { amount: true } }),
  ]);
  const zero = new Prisma.Decimal(0);
  return (payments._sum.amount ?? zero).minus(refunds._sum.amount ?? zero);
}
