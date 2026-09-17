import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type Order, OrderStatus, Prisma, RefundType } from '../../generated/prisma/client';
import { lockOrderById, netPaid } from '../orders/order-ledger';
import { calculateOrderStatus } from '../orders/order-status';
import { OrderCancelledError, OrderNotFoundError } from '../orders/orders.errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type Initiator,
  type OrderCancelled,
  RefundEvents,
  type RefundRecorded,
} from './refund.events';
import { NothingToRefundError, OrderHasPaymentsError, RefundAmountError } from './refunds.errors';

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async refund(
    orderId: number,
    amount: string | null,
    initiator: Initiator,
  ): Promise<RefundRecorded> {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.lock(tx, orderId);
      const paid = await netPaid(tx, order.id);
      if (!paid.greaterThan(0)) {
        throw new NothingToRefundError(order.orderNumber);
      }

      const value = amount === null ? paid : new Prisma.Decimal(amount);
      if (!value.greaterThan(0) || value.greaterThan(paid)) {
        throw new RefundAmountError(order.orderNumber, paid);
      }

      const remaining = paid.minus(value);
      const type = remaining.isZero() ? RefundType.FULL : RefundType.PARTIAL;
      const refund = await tx.refund.create({
        data: {
          orderId: order.id,
          amount: value,
          type,
          initiatedByTelegramId: initiator.telegramId,
          initiatedByName: initiator.name,
        },
      });

      const status =
        type === RefundType.FULL
          ? OrderStatus.CANCELLED
          : calculateOrderStatus(order.amountDue, remaining, order.status);
      const updated = await tx.order.update({ where: { id: order.id }, data: { status } });

      return { refund, order: updated, previousStatus: order.status, amountPaid: remaining };
    });

    this.events.emit(RefundEvents.Recorded, result);
    return result;
  }

  async cancelUnpaid(orderId: number, initiator: Initiator): Promise<OrderCancelled> {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await this.lock(tx, orderId);
      if (order.status === OrderStatus.CANCELLED) {
        throw new OrderCancelledError(order.orderNumber);
      }
      const paid = await netPaid(tx, order.id);
      if (!paid.isZero()) {
        throw new OrderHasPaymentsError(order.orderNumber, paid);
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED },
      });
      return { order: updated, previousStatus: order.status, initiator };
    });

    this.events.emit(RefundEvents.OrderCancelled, result);
    return result;
  }

  private async lock(tx: Prisma.TransactionClient, orderId: number): Promise<Order> {
    const order = await lockOrderById(tx, orderId);
    if (!order) {
      throw new OrderNotFoundError(`#${orderId}`);
    }
    return order;
  }
}
