import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PaymentEvents,
  type PaymentRecorded,
  type PaymentUnmatched,
} from '../../payments/payment-ingestion.types';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramSender } from '../telegram-sender';
import {
  adminPaymentMessage,
  managerPaymentMessage,
  needsAdminAttention,
  unknownPaymentMessage,
} from './payment-templates';

@Injectable()
export class PaymentNotifier {
  private readonly logger = new Logger(PaymentNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: TelegramSender,
  ) {}

  @OnEvent(PaymentEvents.Recorded, { async: true })
  async onRecorded({ order, payment, amountPaid }: PaymentRecorded): Promise<void> {
    try {
      const [manager, payments] = await Promise.all([
        this.prisma.manager.findUniqueOrThrow({ where: { id: order.managerId } }),
        // Лише платежі до цього включно: повідомлення описує стан на момент цього платежу,
        // навіть якщо наступний переказ уже встиг надійти.
        this.prisma.payment.findMany({
          where: { orderId: order.id, id: { lte: payment.id } },
          orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
        }),
      ]);
      const notice = { order, payment, payments, amountPaid };

      await this.sender.send(manager.telegramId, managerPaymentMessage(notice));
      if (needsAdminAttention(order.status)) {
        await this.sender.sendToAdmins(adminPaymentMessage(notice, manager));
      }
    } catch (error) {
      this.logger.error(`Failed to notify about payment #${payment.id}`, error);
    }
  }

  @OnEvent(PaymentEvents.Unmatched, { async: true })
  async onUnmatched({ payment }: PaymentUnmatched): Promise<void> {
    await this.sender.sendToAdmins(unknownPaymentMessage(payment));
  }
}
