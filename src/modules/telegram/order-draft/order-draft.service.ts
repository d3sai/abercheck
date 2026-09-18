import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILES_PER_UPLOAD,
  MAX_FILE_SIZE_BYTES,
  TELEGRAM_CAPTION_LIMIT,
} from '../../attachments/attachments.constants';
import { AttachmentsService, type TelegramFileRef } from '../../attachments/attachments.service';
import { type Manager, type Order, OrderType, Prisma } from '../../../generated/prisma/client';
import { CreateOrderDto } from '../../orders/dto/create-order.dto';
import { OrderNumberTakenError } from '../../orders/orders.errors';
import { OrdersService } from '../../orders/orders.service';
import { type BotReply, button } from '../core/bot-reply';
import { escapeHtml, formatMoney } from '../core/format';
import { TelegramSender } from '../core/telegram-sender';
import { adminOrderCreatedMessage } from '../notifications/order-templates';
import {
  parseExchangeRate,
  parseMoney,
  parseOrderNumber,
  type ParseResult,
  parseTemplate,
  parseText,
} from './order-draft.parsers';

type DraftField = keyof CreateOrderDto;

interface FieldSpec {
  field: DraftField;
  label: string;
  optional: boolean;
  parse: (input: string) => ParseResult;
}

const FIELDS: readonly FieldSpec[] = [
  { field: 'orderNumber', label: 'Номер', optional: false, parse: parseOrderNumber },
  { field: 'clientName', label: 'ФОП', optional: false, parse: parseText(255) },
  { field: 'amountDue', label: 'Сума', optional: false, parse: parseMoney },
  { field: 'exchangeRate', label: 'Курс', optional: true, parse: parseExchangeRate },
  { field: 'comment', label: 'Коментар', optional: true, parse: parseText(2000) },
];

function fieldsFor(type: OrderType): readonly FieldSpec[] {
  return type === OrderType.MINUS_CLOSING
    ? FIELDS.map((f) => (f.field === 'orderNumber' ? { ...f, optional: true } : f))
    : FIELDS;
}

export const DraftAction = {
  Confirm: 'draft:confirm',
  Cancel: 'draft:cancel',
} as const;

interface Draft {
  type: OrderType;
  data: Partial<Record<DraftField, string>>;
  files: TelegramFileRef[];
}

const cancelButton = button('Скасувати', DraftAction.Cancel);

function pluralizeFiles(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'файлів';
  if (mod10 === 1) return 'файл';
  if (mod10 >= 2 && mod10 <= 4) return 'файли';
  return 'файлів';
}

@Injectable()
export class OrderDraftService {
  private readonly drafts = new Map<bigint, Draft>();

  constructor(
    private readonly orders: OrdersService,
    private readonly attachments: AttachmentsService,
    private readonly sender: TelegramSender,
  ) {}

  hasDraft(userId: bigint): boolean {
    return this.drafts.has(userId);
  }

  start(userId: bigint, type: OrderType = OrderType.REGULAR): BotReply {
    this.drafts.set(userId, { type, data: {}, files: [] });
    return this.template(type);
  }

  async input(userId: bigint, text: string): Promise<BotReply | null> {
    const draft = this.drafts.get(userId);
    if (!draft) {
      return null;
    }

    const fields = fieldsFor(draft.type);
    const raw = parseTemplate(text, fields);
    const data: Partial<Record<DraftField, string>> = {};
    const errors: string[] = [];

    for (const field of fields) {
      const value = raw[field.field]?.trim() ?? '';
      if (value.length === 0) {
        if (!field.optional) {
          errors.push(`«${field.label}» — поле обов'язкове.`);
        }
        continue;
      }
      const result = field.parse(value);
      if (!result.ok) {
        errors.push(`«${field.label}»: ${result.error}`);
        continue;
      }
      data[field.field] = result.value;
    }

    if (errors.length === 0 && data.orderNumber && (await this.orders.findByNumber(data.orderNumber))) {
      errors.push(`«Номер»: замовлення № ${data.orderNumber} вже є в системі.`);
    }

    if (errors.length > 0) {
      return {
        html: ['⚠️ Виправте та надішліть ще раз:', ...errors.map((e) => `• ${e}`)].join('\n'),
        buttons: [[cancelButton]],
      };
    }

    draft.data = data;
    return this.summary(draft);
  }

  async addFile(userId: bigint, file: TelegramFileRef, caption?: string): Promise<BotReply | null> {
    const draft = this.drafts.get(userId);
    if (!draft) {
      return null;
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
      return { html: '⚠️ Такий тип файлу не підтримується. Додайте фото, PDF або зображення.' };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { html: '⚠️ Файл завеликий. Максимум 10 МБ.' };
    }
    if (draft.files.length >= MAX_FILES_PER_UPLOAD) {
      return { html: `⚠️ Максимум ${MAX_FILES_PER_UPLOAD} файлів на замовлення.` };
    }
    draft.files.push(file);

    const text = caption?.trim();
    if (!text) {
      return {
        html: `📎 Додано «${escapeHtml(file.filename)}» (${draft.files.length}/${MAX_FILES_PER_UPLOAD}).`,
      };
    }
    return this.input(userId, text);
  }

  async confirm(manager: Manager): Promise<BotReply | null> {
    const draft = this.drafts.get(manager.telegramId);
    if (
      !draft ||
      !fieldsFor(draft.type).every((f) => f.optional || draft.data[f.field] !== undefined)
    ) {
      return null;
    }
    this.drafts.delete(manager.telegramId);

    const dto = plainToInstance(CreateOrderDto, { orderType: draft.type, ...draft.data });
    if (validateSync(dto).length > 0) {
      return { html: '⚠️ Дані замовлення некоректні. Почніть заново: /new' };
    }
    const hasFiles = draft.files.length > 0;
    try {
      const order = await this.orders.create(manager.id, dto, { notify: !hasFiles });
      if (hasFiles) {
        await this.notifyWithAttachment(order, manager, draft.files);
      }
      return {
        html: `✅ Замовлення № <b>${escapeHtml(order.orderNumber)}</b> створено — повідомлю про оплату.`,
      };
    } catch (error) {
      if (error instanceof OrderNumberTakenError) {
        return {
          html: `⚠️ Замовлення № ${escapeHtml(error.orderNumber)} вже є в системі. Почніть заново: /new`,
        };
      }
      throw error;
    }
  }

  // Merges the "order created" admin notice into the file's caption so admins get one message, not two.
  private async notifyWithAttachment(
    order: Order,
    manager: Manager,
    files: TelegramFileRef[],
  ): Promise<void> {
    const notice = adminOrderCreatedMessage(order, manager);
    const canMergeCaption = notice.length <= TELEGRAM_CAPTION_LIMIT;
    let merged = false;
    try {
      await this.attachments.saveFromTelegram(
        order,
        files,
        { telegramId: manager.telegramId, name: manager.name },
        true,
        canMergeCaption ? notice : undefined,
      );
      merged = canMergeCaption;
    } finally {
      if (!merged) {
        await this.sender.sendToAdmins(notice);
      }
    }
  }

  cancel(userId: bigint): BotReply {
    const existed = this.drafts.delete(userId);
    return { html: existed ? 'Скасовано.' : 'Немає активного замовлення.' };
  }

  private template(type: OrderType): BotReply {
    const fields = fieldsFor(type);
    const block = fields.map((f) => `${f.label}: `).join('\n');
    const required = fields
      .filter((f) => !f.optional)
      .map((f) => f.label)
      .join(', ');
    const optional = fields
      .filter((f) => f.optional)
      .map((f) => f.label)
      .join(', ');
    const title = type === OrderType.MINUS_CLOSING ? 'Закриття мінусу' : 'Нове замовлення';
    return {
      html: [
        `📝 <b>${title}</b>`,
        'Заповніть і надішліть одним повідомленням',
        `(файл можна додати тут же або окремо, до ${MAX_FILES_PER_UPLOAD} шт.)`,
        '',
        `<pre>${block}</pre>`,
        `Обов'язково: ${required}${optional ? `\nНеобов'язково: ${optional}` : ''}`,
      ].join('\n'),
      buttons: [[cancelButton]],
    };
  }

  private summary({ type, data, files }: Draft): BotReply {
    const display = (field: DraftField, value: string): string => {
      if (field === 'amountDue') return `${formatMoney(new Prisma.Decimal(value))} грн`;
      if (field === 'exchangeRate') return value.replace('.', ',');
      return escapeHtml(value);
    };
    const fields = fieldsFor(type);
    const width = Math.max(...fields.map((f) => f.label.length)) + 2;
    const lines = fields.map(({ field, label }) => {
      const value = data[field];
      return `${label.padEnd(width)}${value === undefined ? '—' : display(field, value)}`;
    });
    const filesLine =
      files.length > 0 ? `\n📎 ${files.length} ${pluralizeFiles(files.length)}` : '';
    return {
      html: [`<b>Перевірте замовлення</b>`, `<pre>${lines.join('\n')}</pre>${filesLine}`].join(
        '\n',
      ),
      buttons: [
        [button('✅ Створити', DraftAction.Confirm), button('Скасувати', DraftAction.Cancel)],
      ],
    };
  }
}
