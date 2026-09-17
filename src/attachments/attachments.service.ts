import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation';
import type { OrderAttachment } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Initiator } from '../refunds/refund.events';
import { AttachmentNotFoundError } from './attachments.errors';

@Injectable()
export class AttachmentsService {
  private readonly dir: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.dir = resolve(config.get('ATTACHMENTS_DIR', { infer: true }) ?? './uploads');
  }

  async save(
    orderId: number,
    files: Express.Multer.File[],
    uploader: Initiator,
  ): Promise<OrderAttachment[]> {
    await mkdir(this.dir, { recursive: true });
    const attachments: OrderAttachment[] = [];
    for (const file of files) {
      const storageKey = `${randomUUID()}${extname(file.originalname)}`;
      await writeFile(join(this.dir, storageKey), file.buffer);
      attachments.push(
        await this.prisma.orderAttachment.create({
          data: {
            orderId,
            filename: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            storageKey,
            uploadedByTelegramId: uploader.telegramId,
            uploadedByName: uploader.name,
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
    return readFile(join(this.dir, attachment.storageKey));
  }

  async remove(orderId: number, id: number): Promise<void> {
    const attachment = await this.find(orderId, id);
    await this.prisma.orderAttachment.delete({ where: { id: attachment.id } });
    await unlink(join(this.dir, attachment.storageKey)).catch(() => undefined);
  }
}
