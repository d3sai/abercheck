import { Test } from '@nestjs/testing';
import { type Manager, OrderType, Prisma } from '../../../../src/generated/prisma/client';
import { AttachmentsService } from '../../../../src/modules/attachments/attachments.service';
import { OrderNumberTakenError } from '../../../../src/modules/orders/orders.errors';
import { OrdersService } from '../../../../src/modules/orders/orders.service';
import { TelegramSender } from '../../../../src/modules/telegram/core/telegram-sender';
import { OrderDraftService } from '../../../../src/modules/telegram/order-draft/order-draft.service';

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
    kind: 'document' as const,
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

  it('should show a fillable hint without creating anything', () => {
    const reply = service.hint(OrderType.REGULAR);

    expect(reply.html).toContain('Номер');
    expect(reply.html).toContain('0000-066717');
    expect(reply.buttons).toBeUndefined();
  });

  it('should omit the order number line from the minus-closing example', () => {
    const reply = service.hint(OrderType.MINUS_CLOSING);

    expect(reply.html).not.toContain('0000-066717');
    expect(reply.html).toContain('Закриття мінусу');
  });

  it('should ignore plain chat text with no recognizable fields', async () => {
    await expect(service.handleText(MANAGER, 'привіт, як справи?')).resolves.toBeNull();
  });

  it('should list every validation error without creating an order', async () => {
    const reply = await service.handleText(
      MANAGER,
      template({ Номер: '1548', ФОП: '', Сума: 'сто' }),
    );

    expect(reply?.html).toContain('«Номер»');
    expect(reply?.html).toContain('«ФОП» — поле');
    expect(reply?.html).toContain('«Сума»');
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('should reject an order number that already exists', async () => {
    orders.findByNumber.mockResolvedValue({ id: 1 });

    const reply = await service.handleText(MANAGER, template());

    expect(reply?.html).toContain('вже є в системі');
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('should create the order immediately once the message is complete', async () => {
    orders.create.mockResolvedValue(createdOrder());

    const reply = await service.handleText(MANAGER, template());

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
    expect(reply?.html).toContain('створено');
    expect(reply?.html).toContain('6 158,41');
  });

  it('should treat a missing order number as a minus-closing order', async () => {
    orders.create.mockResolvedValue(
      createdOrder({ orderNumber: '9999-000001', orderType: 'MINUS_CLOSING' }),
    );

    const reply = await service.handleText(MANAGER, template({ Номер: '' }));

    expect(orders.create).toHaveBeenCalledWith(
      MANAGER.id,
      expect.objectContaining({ orderType: 'MINUS_CLOSING' }),
      { notify: true },
    );
    expect(reply?.html).toContain('Закриття мінусу');
  });

  describe('freeform, line-per-field messages', () => {
    it('should create the order from unlabelled lines, like the old bot', async () => {
      orders.create.mockResolvedValue(createdOrder());

      const reply = await service.handleText(
        MANAGER,
        ['0000-066717', 'Чернявський Владислав', '6 158,41 грн', '44,9', 'Терміново'].join('\n'),
      );

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
      expect(reply?.html).toContain('створено');
    });

    it('should treat a missing first line as a minus-closing order', async () => {
      orders.create.mockResolvedValue(
        createdOrder({ orderNumber: '9999-000001', orderType: 'MINUS_CLOSING' }),
      );

      const reply = await service.handleText(
        MANAGER,
        ['Чернявський Владислав', '6 158,41 грн'].join('\n'),
      );

      expect(orders.create).toHaveBeenCalledWith(
        MANAGER.id,
        expect.objectContaining({ orderType: 'MINUS_CLOSING' }),
        { notify: true },
      );
      expect(reply?.html).toContain('Закриття мінусу');
    });

    it('should surface a validation error for a malformed order number line', async () => {
      const reply = await service.handleText(
        MANAGER,
        ['1234-5678', 'Чернявський Владислав', '6158,41 грн'].join('\n'),
      );

      expect(reply?.html).toContain('«Номер»');
      expect(orders.create).not.toHaveBeenCalled();
    });
  });

  it('should report a number taken between the check and the creation, keeping files buffered', async () => {
    orders.create.mockRejectedValue(new OrderNumberTakenError('0000-066717'));

    await service.addFile(MANAGER, file());
    const reply = await service.handleText(MANAGER, template());

    expect(reply?.html).toContain('вже є в системі');

    orders.create.mockResolvedValue(createdOrder());
    const retry = await service.handleText(MANAGER, template());
    expect(attachments.saveFromTelegram).toHaveBeenCalledWith(
      expect.anything(),
      [file()],
      { telegramId: MANAGER.telegramId, name: MANAGER.name },
      true,
      expect.any(String),
    );
    expect(retry?.html).toContain('створено');
  });

  it('should drop buffered files on cancel', async () => {
    await service.addFile(MANAGER, file());

    expect(service.cancel(USER).html).toContain('Скасовано');

    orders.create.mockResolvedValue(createdOrder());
    await service.handleText(MANAGER, template());
    expect(attachments.saveFromTelegram).not.toHaveBeenCalled();
  });

  it('should say there is nothing to cancel otherwise', () => {
    expect(service.cancel(USER).html).toContain('Нема чого');
  });

  describe('attaching a file', () => {
    it('should just acknowledge a standalone file with no caption', async () => {
      const reply = await service.addFile(MANAGER, file());

      expect(reply.html).toContain('Додано');
      expect(reply.html).toContain('1/5');
    });

    it('should create the order from a caption sent together with the file', async () => {
      orders.create.mockResolvedValue(createdOrder());

      const reply = await service.addFile(MANAGER, file(), template());

      expect(reply.html).toContain('створено');
      expect(attachments.saveFromTelegram).toHaveBeenCalledWith(
        expect.anything(),
        [file()],
        { telegramId: MANAGER.telegramId, name: MANAGER.name },
        true,
        expect.stringContaining('Нове замовлення'),
      );
    });

    it('should reject an unsupported file type', async () => {
      const reply = await service.addFile(MANAGER, { ...file(), mimeType: 'application/zip' });

      expect(reply.html).toContain('не підтримується');
    });

    it('should cap the number of buffered files', async () => {
      for (let i = 0; i < 5; i += 1) {
        await service.addFile(MANAGER, file(`f${i}.png`));
      }

      const reply = await service.addFile(MANAGER, file('overflow.png'));

      expect(reply.html).toContain('Максимум 5');
    });

    it('should nudge instead of the generic fallback when files are waiting for details', async () => {
      await service.addFile(MANAGER, file());

      const reply = await service.handleText(MANAGER, 'ще не знаю що писати');

      expect(reply?.html).toContain('без даних замовлення');
    });

    it('should notify admins with a single message merging the order and the file', async () => {
      const order = createdOrder();
      orders.create.mockResolvedValue(order);

      await service.addFile(MANAGER, file(), template());

      expect(orders.create).toHaveBeenCalledWith(MANAGER.id, expect.anything(), { notify: false });
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
      const order = createdOrder({ comment: longComment });
      orders.create.mockResolvedValue(order);

      await service.addFile(MANAGER, file(), template({ Коментар: longComment }));

      expect(attachments.saveFromTelegram).toHaveBeenCalledWith(
        order,
        [file()],
        { telegramId: MANAGER.telegramId, name: MANAGER.name },
        true,
        undefined,
      );
      expect(sender.sendToAdmins).toHaveBeenCalledWith(expect.stringContaining('Нове замовлення'));
    });

    it('should attach a stray file to the order just created instead of starting a new upload', async () => {
      orders.create.mockResolvedValue(createdOrder());
      await service.handleText(MANAGER, template());
      attachments.saveFromTelegram.mockClear();

      const reply = await service.addFile(MANAGER, file('after.png'));

      expect(reply.html).toContain('до замовлення');
      expect(attachments.saveFromTelegram).toHaveBeenCalledWith(
        expect.objectContaining({ orderNumber: '0000-066717' }),
        [file('after.png')],
        { telegramId: MANAGER.telegramId, name: MANAGER.name },
        true,
      );
    });
  });
});
