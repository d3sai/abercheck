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
  parsePhone,
  type ParseResult,
  parseText,
} from './order-draft.parsers';

type DraftField = keyof CreateOrderDto;

interface DraftStep {
  field: DraftField;
  label: string;
  prompt: string;
  optional: boolean;
  parse: (input: string) => ParseResult;
}

const STEPS: readonly DraftStep[] = [
  {
    field: 'orderNumber',
    label: 'Номер',
    prompt: 'Номер замовлення в 1С, напр. 0000-066717',
    optional: false,
    parse: parseOrderNumber,
  },
  {
    field: 'clientName',
    label: 'Клієнт',
    prompt: 'ПІБ або назва клієнта',
    optional: false,
    parse: parseText(255),
  },
  {
    field: 'amountDue',
    label: 'Сума',
    prompt: 'Сума до оплати в гривнях, напр. 6 158,41',
    optional: false,
    parse: parseMoney,
  },
  {
    field: 'exchangeRate',
    label: 'Курс',
    prompt: 'Курс долара, напр. 44,9',
    optional: true,
    parse: parseExchangeRate,
  },
  {
    field: 'clientPhone',
    label: 'Телефон',
    prompt: 'Телефон клієнта',
    optional: true,
    parse: parsePhone,
  },
  {
    field: 'invoiceNumber',
    label: 'Рахунок / інвойс',
    prompt: 'Номер рахунку або інвойсу',
    optional: true,
    parse: parseText(64),
  },
  {
    field: 'requisites',
    label: 'Реквізити',
    prompt: 'IBAN або інші реквізити',
    optional: true,
    parse: parseText(2000),
  },
  {
    field: 'comment',
    label: 'Коментар',
    prompt: 'Коментар до замовлення',
    optional: true,
    parse: parseText(2000),
  },
];

export const DraftAction = {
  Skip: 'draft:skip',
  Confirm: 'draft:confirm',
  Cancel: 'draft:cancel',
} as const;

interface Draft {
  step: number;
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
    const draft: Draft = { step: 0, data: {} };
    this.drafts.set(userId, draft);
    return this.prompt(draft);
  }

  async input(userId: bigint, text: string): Promise<BotReply | null> {
    const draft = this.drafts.get(userId);
    if (!draft) {
      return null;
    }
    const step = STEPS[draft.step];
    if (!step) {
      return { ...this.summary(draft), html: 'Натисніть «Створити» або «Скасувати».' };
    }

    const result = step.parse(text);
    if (!result.ok) {
      return { html: `⚠️ ${escapeHtml(result.error)}`, buttons: this.prompt(draft).buttons };
    }
    if (step.field === 'orderNumber' && (await this.orders.findByNumber(result.value))) {
      return {
        html: `⚠️ Замовлення № ${escapeHtml(result.value)} вже є в системі. Вкажіть інший номер.`,
        buttons: [[cancelButton]],
      };
    }

    draft.data[step.field] = result.value;
    return this.advance(draft);
  }

  skip(userId: bigint): BotReply | null {
    const draft = this.drafts.get(userId);
    if (!draft || !STEPS[draft.step]?.optional) {
      return null;
    }
    return this.advance(draft);
  }

  async confirm(userId: bigint, managerId: number): Promise<BotReply | null> {
    const draft = this.drafts.get(userId);
    if (!draft || draft.step < STEPS.length) {
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

  private advance(draft: Draft): BotReply {
    draft.step += 1;
    return draft.step < STEPS.length ? this.prompt(draft) : this.summary(draft);
  }

  private prompt(draft: Draft): BotReply {
    const step = STEPS[draft.step]!;
    const position = `<b>${draft.step + 1}/${STEPS.length}.</b>`;
    const buttons = step.optional
      ? [[button('Пропустити', DraftAction.Skip), cancelButton]]
      : [[cancelButton]];
    return {
      html: `${position} ${step.prompt}${step.optional ? " (необов'язково)" : ''}:`,
      buttons,
    };
  }

  private summary({ data }: Draft): BotReply {
    const display = (field: DraftField, value: string): string => {
      if (field === 'amountDue') return `${formatMoney(new Prisma.Decimal(value))} грн`;
      if (field === 'exchangeRate') return value.replace('.', ',');
      return escapeHtml(value);
    };
    const lines = STEPS.map(({ field, label }) => {
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
