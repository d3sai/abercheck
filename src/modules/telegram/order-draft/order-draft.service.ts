import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma } from '../../../generated/prisma/client';
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
  hint: string;
  optional: boolean;
  parse: (input: string) => ParseResult;
}

const FIELDS: readonly FieldSpec[] = [
  {
    field: 'orderNumber',
    label: 'Номер',
    hint: 'номер замовлення в 1С, напр. 0000-066717',
    optional: false,
    parse: parseOrderNumber,
  },
  {
    field: 'clientName',
    label: 'ФОП',
    hint: 'назва або ПІБ ФОП, напр. ФОП Іванов І. І.',
    optional: false,
    parse: parseText(255),
  },
  {
    field: 'amountDue',
    label: 'Сума',
    hint: 'сума до оплати в гривнях, напр. 6 158,41',
    optional: false,
    parse: parseMoney,
  },
  {
    field: 'exchangeRate',
    label: 'Курс',
    hint: "курс долара, напр. 44,9 (необов'язково)",
    optional: true,
    parse: parseExchangeRate,
  },
  {
    field: 'comment',
    label: 'Коментар',
    hint: "необов'язково",
    optional: true,
    parse: parseText(2000),
  },
];

export const DraftAction = {
  Confirm: 'draft:confirm',
  Cancel: 'draft:cancel',
} as const;

interface Draft {
  data: Partial<Record<DraftField, string>>;
}

const cancelButton = button('Скасувати', DraftAction.Cancel);

@Injectable()
export class OrderDraftService {
  private readonly drafts = new Map<bigint, Draft>();

  constructor(private readonly orders: OrdersService) {}

  hasDraft(userId: bigint): boolean {
    return this.drafts.has(userId);
  }

  start(userId: bigint): BotReply {
    this.drafts.set(userId, { data: {} });
    return this.template();
  }

  async input(userId: bigint, text: string): Promise<BotReply | null> {
    const draft = this.drafts.get(userId);
    if (!draft) {
      return null;
    }

    const raw = parseTemplate(text, FIELDS);
    const data: Partial<Record<DraftField, string>> = {};
    const errors: string[] = [];

    for (const field of FIELDS) {
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

    if (errors.length === 0 && (await this.orders.findByNumber(data.orderNumber!))) {
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

  async confirm(userId: bigint, managerId: number): Promise<BotReply | null> {
    const draft = this.drafts.get(userId);
    if (!draft || !FIELDS.every((f) => f.optional || draft.data[f.field] !== undefined)) {
      return null;
    }
    this.drafts.delete(userId);

    const dto = plainToInstance(CreateOrderDto, draft.data);
    if (validateSync(dto).length > 0) {
      return { html: '⚠️ Дані замовлення некоректні. Почніть заново: /new' };
    }
    try {
      const order = await this.orders.create(managerId, dto);
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

  private template(): BotReply {
    const block = FIELDS.map((f) => `${f.label}: `).join('\n');
    const hints = FIELDS.map((f) => `• ${f.label} — ${f.hint}`).join('\n');
    return {
      html: [
        '📝 <b>Нове замовлення</b>',
        'Скопіюйте шаблон, заповніть і надішліть одним повідомленням:',
        '',
        `<pre>${block}</pre>`,
        '',
        hints,
      ].join('\n'),
      buttons: [[cancelButton]],
    };
  }

  private summary({ data }: Draft): BotReply {
    const display = (field: DraftField, value: string): string => {
      if (field === 'amountDue') return `${formatMoney(new Prisma.Decimal(value))} грн`;
      if (field === 'exchangeRate') return value.replace('.', ',');
      return escapeHtml(value);
    };
    const lines = FIELDS.map(({ field, label }) => {
      const value = data[field];
      return `${label}: ${value === undefined ? '—' : display(field, value)}`;
    });
    return {
      html: ['<b>Перевірте замовлення</b>', ...lines].join('\n'),
      buttons: [
        [button('✅ Створити', DraftAction.Confirm), button('Скасувати', DraftAction.Cancel)],
      ],
    };
  }
}
