import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import type { EnvironmentVariables } from '../../common/config/env.validation';
import type { Order, OrderAttachment } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Initiator } from '../refunds/refund.events';
import { escapeHtml, formatMoney } from '../telegram/core/format';
import { AttachmentNotFoundError, AttachmentStorageError } from './attachments.errors';

type CaptionOrder = Pick<Order, 'orderNumber' | 'clientName' | 'amountDue'>;

function caption(order: CaptionOrder, uploader: Initiator): string {
  return [
    `📎 Замовлення № <b>${escapeHtml(order.orderNumber)}</b>`,
    `Клієнт: ${escapeHtml(order.clientName)}`,
    `Сума до оплати: ${formatMoney(order.amountDue)} грн`,
    `Додав: ${escapeHtml(uploader.name)}`,
  ].join('\n');
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly storageChatId: number;

  constructor(
    private readonly prisma: PrismaService,
    @InjectBot() private readonly bot: Telegraf,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.storageChatId = config.get('TELEGRAM_ADMIN_CHAT_ID', { infer: true });
  }

  async save(
    order: CaptionOrder & { id: number },
    files: Express.Multer.File[],
    uploader: Initiator,
    keepMessageOnDelete: boolean,
  ): Promise<OrderAttachment[]> {
    const attachments: OrderAttachment[] = [];
    for (const file of files) {
      let sent;
      try {
        sent = await this.bot.telegram.sendDocument(
          this.storageChatId,
          { source: file.buffer, filename: file.originalname },
          { caption: caption(order, uploader), parse_mode: 'HTML' },
        );
      } catch (error) {
        this.logger.error(
          `Failed to store an attachment for order #${order.id} in Telegram`,
          error,
        );
        throw new AttachmentStorageError(error);
      }
      attachments.push(
        await this.prisma.orderAttachment.create({
          data: {
            orderId: order.id,
            filename: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            telegramFileId: sent.document.file_id,
            telegramMessageId: sent.message_id,
            uploadedByTelegramId: uploader.telegramId,
            uploadedByName: uploader.name,
            keepMessageOnDelete,
          },
        }),
      );
    }
    return attachments;
  }

  list(orderId: number): Promise<OrderAttachment[]> {
    return this.prisma.orderAttachment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async find(orderId: number, id: number): Promise<OrderAttachment> {
    const attachment = await this.prisma.orderAttachment.findFirst({ where: { id, orderId } });
    if (!attachment) {
      throw new AttachmentNotFoundError(id);
    }
    return attachment;
  }

  async readFile(attachment: OrderAttachment): Promise<Buffer> {
    let url: URL;
    try {
      url = await this.bot.telegram.getFileLink(attachment.telegramFileId);
    } catch (error) {
      throw new AttachmentStorageError(error);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new AttachmentStorageError(
        new Error(`Telegram file download responded ${response.status}`),
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(orderId: number, id: number): Promise<void> {
    const attachment = await this.find(orderId, id);
    await this.prisma.orderAttachment.delete({ where: { id: attachment.id } });
    if (attachment.keepMessageOnDelete) {
      return;
    }
    await this.bot.telegram
      .deleteMessage(this.storageChatId, attachment.telegramMessageId)
      .catch((error) =>
        this.logger.warn(`Failed to delete Telegram message for attachment #${id}`, error),
      );
  }
}
