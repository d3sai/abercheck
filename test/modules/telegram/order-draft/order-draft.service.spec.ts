import { Test } from '@nestjs/testing';
import { type Manager, Prisma } from '../../../../src/generated/prisma/client';
import { AttachmentsService } from '../../../../src/modules/attachments/attachments.service';
import { OrderNumberTakenError } from '../../../../src/modules/orders/orders.errors';
import { OrdersService } from '../../../../src/modules/orders/orders.service';
import type { BotReply } from '../../../../src/modules/telegram/core/bot-reply';
import { TelegramSender } from '../../../../src/modules/telegram/core/telegram-sender';
import {
  DraftAction,
  OrderDraftService,
} from '../../../../src/modules/telegram/order-draft/order-draft.service';

describe('OrderDraftService', () => {
  const USER = 5000000000n;
  const MANAGER: Manager = {
    id: 7,
    telegramId: USER,
    name: 'Христина',
    username: 'khrystyna',
    status: 'ACTIVE',
    role: 'MANAGER',
    login: null,
    passwordHash: null,
    sessionVersion: 0,
    createdAt: new Date(),
  };
  const orders = { findByNumber: jest.fn(), create: jest.fn() };
  const attachments = { saveFromTelegram: jest.fn() };
  const sender = { sendToAdmins: jest.fn() };
  let service: OrderDraftService;

  const file = (filename = 'screenshot.png') => ({
    fileId: 'file-1',
    filename,
    mimeType: 'image/png',
    size: 1024,
  });

  const createdOrder = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 1,
    orderNumber: '0000-066717',
    clientName: 'Чернявський Владислав',
    amountDue: new Prisma.Decimal('6158.41'),
    exchangeRate: new Prisma.Decimal('44.9'),
    comment: 'Терміново',
    orderType: 'REGULAR',
    status: 'AWAITING_PAYMENT',
    managerId: MANAGER.id,
    createdAt: new Date('2026-09-18T20:41:00Z'),
    updatedAt: new Date('2026-09-18T20:41:00Z'),
    ...overrides,
  });

  const buttonData = (reply: BotReply | null) =>
    reply?.buttons?.flat().map((b) => ('callback_data' in b ? b.callback_data : undefined));

  const template = (overrides: Partial<Record<string, string>> = {}): string => {
    const fields = {
      Номер: '0000-066717',
      ФОП: 'Чернявський Владислав',
      Сума: '6 158,41',
      Курс: '44,9',
      Коментар: 'Терміново',
      ...overrides,
    };
    return Object.entries(fields)
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n');
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderDraftService,
        { provide: OrdersService, useValue: orders },
        { provide: AttachmentsService, useValue: attachments },
        { provide: TelegramSender, useValue: sender },
      ],
    }).compile();

    service = moduleRef.get(OrderDraftService);
    orders.findByNumber.mockResolvedValue(null);
  });

  afterEach(() => jest.resetAllMocks());

  it('should start with a fillable template and only a cancel button', () => {
    const reply = service.start(USER);

    expect(reply.html).toContain('Номер: ');
    expect(reply.html).toContain('ФОП: ');
    expect(buttonData(reply)).toEqual([DraftAction.Cancel]);
  });

  it('should ignore text when no draft is active', async () => {
    await expect(service.input(USER, template())).resolves.toBeNull();
  });

  it('should list every validation error and ask to resend the template', async () => {
    service.start(USER);

    const reply = await service.input(USER, template({ Номер: '1548', ФОП: '', Сума: 'сто' }));

    expect(reply?.html).toContain('«Номер»');
    expect(reply?.html).toContain('«ФОП» — поле');
    expect(reply?.html).toContain('«Сума»');
    expect(buttonData(reply)).toEqual([DraftAction.Cancel]);
  });

  it('should reject an order number that already exists', async () => {
    orders.findByNumber.mockResolvedValue({ id: 1 });
    service.start(USER);

    const reply = await service.input(USER, template());

    expect(reply?.html).toContain('вже є в системі');
    expect(buttonData(reply)).toEqual([DraftAction.Cancel]);
  });

  it('should treat blank optional fields as omitted', async () => {
    service.start(USER);

    const reply = await service.input(USER, template({ Курс: '', Коментар: '' }));

    expect(reply?.html).toContain('Курс      —');
    expect(reply?.html).toContain('Коментар  —');
  });

  it('should show a summary with normalized values and create the order on confirm', async () => {
    service.start(USER);

    const summary = await service.input(USER, template());
    expect(summary?.html).toContain('Перевірте замовлення');
    expect(buttonData(summary)).toEqual([DraftAction.Confirm, DraftAction.Cancel]);

    orders.create.mockResolvedValue({ orderNumber: '0000-066717' });
    const done = await service.confirm(MANAGER);

    expect(orders.create).toHaveBeenCalledWith(
      MANAGER.id,
      {
        orderType: 'REGULAR',
        orderNumber: '0000-066717',
        clientName: 'Чернявський Владислав',
        amountDue: '6158.41',
        exchangeRate: '44.9',
        comment: 'Терміново',
      },
      { notify: true },
    );
    expect(done?.html).toContain('створено');
    expect(service.hasDraft(USER)).toBe(false);
  });

  it("should render the summary in the managers' format", async () => {
    service.start(USER);

    const summary = await service.input(USER, template());

    expect(summary?.html).toBe(
      [
        '<b>Перевірте замовлення</b>',
        '<pre>Номер     0000-066717',
        'ФОП       Чернявський Владислав',
        'Сума      6 158,41 грн',
        'Курс      44,9',
        'Коментар  Терміново</pre>',
      ].join('\n'),
    );
  });

  it('should not confirm an unfinished draft', async () => {
    service.start(USER);

    await expect(service.confirm(MANAGER)).resolves.toBeNull();
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('should report a number taken between the check and the confirmation', async () => {
    service.start(USER);
    await service.input(USER, template());
    orders.create.mockRejectedValue(new OrderNumberTakenError('0000-066717'));

    const reply = await service.confirm(MANAGER);

    expect(reply?.html).toContain('вже є в системі');
  });

  it('should drop the draft on cancel', () => {
    service.start(USER);

    expect(service.cancel(USER).html).toContain('Скасовано');
    expect(service.hasDraft(USER)).toBe(false);
  });

  describe('attaching a file', () => {
    it('should confirm a standalone file without touching the template', async () => {
      service.start(USER);

      const reply = await service.addFile(USER, file());

      expect(reply?.html).toContain('Додано');
      expect(reply?.html).toContain('1/5');
    });

    it('should fill the order from a caption sent together with the file', async () => {
      service.start(USER);

      const reply = await service.addFile(USER, file(), template());

      expect(reply?.html).toContain('Перевірте замовлення');
      expect(reply?.html).toContain('📎 1 файл');
    });

    it('should reject an unsupported file type', async () => {
      service.start(USER);

      const reply = await service.addFile(USER, { ...file(), mimeType: 'application/zip' });

      expect(reply?.html).toContain('не підтримується');
    });

    it('should notify admins with a single message merging the order and the file', async () => {
      service.start(USER);
      await service.addFile(USER, file(), template());

      const order = createdOrder();
      orders.create.mockResolvedValue(order);
      await service.confirm(MANAGER);

      expect(orders.create).toHaveBeenCalledWith(MANAGER.id, expect.anything(), {
        notify: false,
      });
      expect(attachments.saveFromTelegram).toHaveBeenCalledWith(
        order,
        [file()],
        { telegramId: MANAGER.telegramId, name: MANAGER.name },
        true,
        expect.stringContaining('Нове замовлення'),
      );
      expect(sender.sendToAdmins).not.toHaveBeenCalled();
    });

    it('should fall back to a separate admin message when the merged caption would be too long', async () => {
      const longComment = 'Дуже '.repeat(200).trim();
      service.start(USER);
      await service.addFile(USER, file(), template({ Коментар: longComment }));

      const order = createdOrder({ comment: longComment });
      orders.create.mockResolvedValue(order);
      await service.confirm(MANAGER);

      expect(attachments.saveFromTelegram).toHaveBeenCalledWith(
        order,
        [file()],
        { telegramId: MANAGER.telegramId, name: MANAGER.name },
        true,
        undefined,
      );
      expect(sender.sendToAdmins).toHaveBeenCalledWith(expect.stringContaining('Нове замовлення'));
    });
  });
});
