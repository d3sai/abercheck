import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MatchType, type Order, type Payment, Prisma } from '../generated/prisma/client';
import { normalizeOrderNumber } from '../orders/order-number';
import { calculateOrderStatus } from '../orders/order-status';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import {
  type IngestionResult,
  PaymentEvents,
  type PaymentRecorded,
  type PaymentUnmatched,
} from './payment-ingestion.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** Приймає платіж від сервіса-джерела: запис, перерахунок статусу, подія для сповіщення. */
  async ingest(dto: CreatePaymentDto): Promise<IngestionResult> {
    const existing = await this.findByExternalId(dto.external_transaction_id);
    if (existing) {
      return { kind: 'duplicate', payment: existing };
    }

    let result: PaymentRecorded | PaymentUnmatched;
    try {
      result = await this.prisma.$transaction((tx) => this.record(tx, dto));
    } catch (error) {
      // Паралельний запит із тією самою транзакцією встиг першим — unique constraint спрацював.
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

  private async record(
    tx: Prisma.TransactionClient,
    dto: CreatePaymentDto,
  ): Promise<PaymentRecorded | PaymentUnmatched> {
    const reportedOrderNumber = dto.order_number ?? null;
    const order = reportedOrderNumber
      ? await this.lockOrder(tx, normalizeOrderNumber(reportedOrderNumber))
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
    if (!order) {
      return { kind: 'unmatched', payment };
    }

    const { _sum } = await tx.payment.aggregate({
      where: { orderId: order.id },
      _sum: { amount: true },
    });
    const amountPaid = _sum.amount ?? new Prisma.Decimal(0);
    const status = calculateOrderStatus(order.amountDue, amountPaid, order.status);
    const updated =
      status === order.status
        ? order
        : await tx.order.update({ where: { id: order.id }, data: { status } });

    return { kind: 'recorded', payment, order: updated, previousStatus: order.status, amountPaid };
  }

  /**
   * Блокує рядок замовлення до кінця транзакції. Два перекази на одне замовлення
   * (ФОП + ТОВ з різницею в секунди) обробляються по черзі, і кожен рахує суму
   * з урахуванням попереднього — без цього обидва побачили б лише свій платіж.
   */
  private async lockOrder(
    tx: Prisma.TransactionClient,
    orderNumber: string,
  ): Promise<Order | null> {
    const rows = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM orders WHERE order_number = ${orderNumber} FOR UPDATE`;
    const id = rows[0]?.id;
    return id === undefined ? null : tx.order.findUnique({ where: { id } });
  }

  private findByExternalId(externalTransactionId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { externalTransactionId } });
  }
}
