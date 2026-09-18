import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILES_PER_UPLOAD,
  MAX_FILE_SIZE_BYTES,
} from '../../attachments/attachments.constants';
import { AttachmentsService, type TelegramFileRef } from '../../attachments/attachments.service';
import { OrderType, Prisma, type Manager } from '../../../generated/prisma/client';
import { CreateOrderDto } from '../../orders/dto/create-order.dto';
import { OrderNumberTakenError } from '../../orders/orders.errors';
import { OrdersService } from '../../orders/orders.service';
import { type BotReply, button } from '../core/bot-reply';
import { escapeHtml, formatMoney } from '../core/format';
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

@Injectable()
export class OrderDraftService {
  private readonly drafts = new Map<bigint, Draft>();

  constructor(
    private readonly orders: OrdersService,
    private readonly attachments: AttachmentsService,
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
        html: ['⚠️ Виправте та надішліть шаблон ще раз:', ...errors.map((e) => `• ${e}`)].join(
          '\n',
        ),
        buttons: [[cancelButton]],
      };
    }

    draft.data = data;
    return this.summary(draft);
  }

  addFile(userId: bigint, file: TelegramFileRef): BotReply | null {
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
    return { html: `📎 Додано «${escapeHtml(file.filename)}» (${draft.files.length}/${MAX_FILES_PER_UPLOAD}).` };
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
    try {
      const order = await this.orders.create(manager.id, dto);
      if (draft.files.length > 0) {
        await this.attachments.saveFromTelegram(
          order,
          draft.files,
          { telegramId: manager.telegramId, name: manager.name },
          true,
        );
      }
      return {
        html: `✅ Замовлення № <b>${escapeHtml(order.orderNumber)}</b> створено. Я повідомлю, щойно надійде оплата.`,
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

  cancel(userId: bigint): BotReply {
    const existed = this.drafts.delete(userId);
    return {
      html: existed ? 'Створення замовлення скасовано.' : 'Немає замовлення, яке створюється.',
    };
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
        'Заповніть і надішліть одним повідомленням:',
        '',
        `<pre>${block}</pre>`,
        `Обов'язково: ${required}.${optional ? ` Необов'язково: ${optional}.` : ''}`,
        `📎 Можна долучити файл окремим повідомленням (до ${MAX_FILES_PER_UPLOAD} шт.).`,
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
    const lines = fields.map(({ field, label }) => {
      const value = data[field];
      return `${label}: ${value === undefined ? '—' : display(field, value)}`;
    });
    if (files.length > 0) {
      lines.push(`Файли: ${files.length}`);
    }
    return {
      html: ['<b>Перевірте замовлення</b>', ...lines].join('\n'),
      buttons: [
        [button('✅ Створити', DraftAction.Confirm), button('Скасувати', DraftAction.Cancel)],
      ],
    };
  }
}
