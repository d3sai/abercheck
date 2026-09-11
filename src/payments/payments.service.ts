import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MatchType,
  type Order,
  OrderStatus,
  type Payment,
  Prisma,
} from '../generated/prisma/client';
import { lockOrderByNumber, netPaid } from '../orders/order-ledger';
import { normalizeOrderNumber } from '../orders/order-number';
import { calculateOrderStatus } from '../orders/order-status';
import { OrderCancelledError, OrderNotFoundError } from '../orders/orders.errors';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import {
  type IngestionResult,
  PaymentEvents,
  type PaymentRecorded,
  type PaymentUnmatched,
} from './payment-ingestion.types';
import { PaymentAlreadyAttachedError, PaymentNotFoundError } from './payments.errors';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async ingest(dto: CreatePaymentDto): Promise<IngestionResult> {
    const existing = await this.findByExternalId(dto.external_transaction_id);
    if (existing) {
      return { kind: 'duplicate', payment: existing };
    }

    let result: PaymentRecorded | PaymentUnmatched;
    try {
      result = await this.prisma.$transaction((tx) => this.record(tx, dto));
    } catch (error) {
      const duplicate = isUniqueViolation(error)
        ? await this.findByExternalId(dto.external_transaction_id)
        : null;
      if (!duplicate) {
        throw error;
      }
      return { kind: 'duplicate', payment: duplicate };
    }

    this.events.emit(
      result.kind === 'recorded' ? PaymentEvents.Recorded : PaymentEvents.Unmatched,
      result,
    );
    return result;
  }

  async attach(paymentId: number, orderNumber: string): Promise<PaymentRecorded> {
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      const payment =
        locked.length > 0 ? await tx.payment.findUnique({ where: { id: paymentId } }) : null;
      if (!payment) {
        throw new PaymentNotFoundError(paymentId);
      }
      if (payment.orderId !== null) {
        throw new PaymentAlreadyAttachedError(paymentId);
      }

      const number = normalizeOrderNumber(orderNumber);
      const order = await lockOrderByNumber(tx, number);
      if (!order) {
        throw new OrderNotFoundError(number);
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new OrderCancelledError(number);
      }

      const attached = await tx.payment.update({
        where: { id: paymentId },
        data: { orderId: order.id },
      });
      return this.applyToOrder(tx, attached, order);
    });

    this.events.emit(PaymentEvents.Recorded, result);
    return result;
  }

  findById(id: number): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { id } });
  }

  async findUnmatched(limit: number): Promise<{ payments: Payment[]; total: number }> {
    const where = { orderId: null };
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { paidAt: 'desc' }, take: limit }),
      this.prisma.payment.count({ where }),
    ]);
    return { payments, total };
  }

  private async record(
    tx: Prisma.TransactionClient,
    dto: CreatePaymentDto,
  ): Promise<PaymentRecorded | PaymentUnmatched> {
    const reportedOrderNumber = dto.order_number ?? null;
    const order = reportedOrderNumber
      ? await lockOrderByNumber(tx, normalizeOrderNumber(reportedOrderNumber))
      : null;

    const payment = await tx.payment.create({
      data: {
        externalTransactionId: dto.external_transaction_id,
        amount: dto.amount,
        payerName: dto.payer_name,
        receivingAccount: dto.receiving_account,
        purposeText: dto.purpose_text,
        paidAt: new Date(dto.paid_at),
        reportedOrderNumber,
        orderId: order?.id ?? null,
        matchType: order ? MatchType.MATCHED_BY_PROVIDER : MatchType.MANUAL,
      },
    });
    return order ? this.applyToOrder(tx, payment, order) : { kind: 'unmatched', payment };
  }

  private async applyToOrder(
    tx: Prisma.TransactionClient,
    payment: Payment,
    order: Order,
  ): Promise<PaymentRecorded> {
    const amountPaid = await netPaid(tx, order.id);
    const status = calculateOrderStatus(order.amountDue, amountPaid, order.status);
    const updated =
      status === order.status
        ? order
        : await tx.order.update({ where: { id: order.id }, data: { status } });

    return { kind: 'recorded', payment, order: updated, previousStatus: order.status, amountPaid };
  }

  private findByExternalId(externalTransactionId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { externalTransactionId } });
  }
}
