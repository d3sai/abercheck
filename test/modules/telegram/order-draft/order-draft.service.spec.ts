import { Test } from '@nestjs/testing';
import { OrderNumberTakenError } from '../../../../src/modules/orders/orders.errors';
import { OrdersService } from '../../../../src/modules/orders/orders.service';
import type { BotReply } from '../../../../src/modules/telegram/core/bot-reply';
import {
  DraftAction,
  OrderDraftService,
} from '../../../../src/modules/telegram/order-draft/order-draft.service';

describe('OrderDraftService', () => {
  const USER = 5000000000n;
  const orders = { findByNumber: jest.fn(), create: jest.fn() };
  let service: OrderDraftService;

  const buttonData = (reply: BotReply | null) =>
    reply?.buttons?.flat().map((b) => ('callback_data' in b ? b.callback_data : undefined));

  async function fillRequired(): Promise<void> {
    service.start(USER);
    await service.input(USER, '№А 0000-066717');
    await service.input(USER, 'Чернявський Владислав');
    await service.input(USER, '6 158,41 грн');
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [OrderDraftService, { provide: OrdersService, useValue: orders }],
    }).compile();

    service = moduleRef.get(OrderDraftService);
    orders.findByNumber.mockResolvedValue(null);
  });

  afterEach(() => jest.resetAllMocks());

  it('should start with the order number and offer only cancel on a required step', () => {
    const reply = service.start(USER);

    expect(reply.html).toContain('1/8');
    expect(reply.html).toContain('0000-066717');
    expect(buttonData(reply)).toEqual([DraftAction.Cancel]);
  });

  it('should ignore text when no draft is active', async () => {
    await expect(service.input(USER, 'hello')).resolves.toBeNull();
  });

  it('should keep the step and explain the format on invalid input', async () => {
    service.start(USER);

    const reply = await service.input(USER, '1548');

    expect(reply?.html).toContain('0000-066717');
    const next = await service.input(USER, '0000-066717');
    expect(next?.html).toContain('2/8');
  });

  it('should reject an order number that already exists', async () => {
    orders.findByNumber.mockResolvedValue({ id: 1 });
    service.start(USER);

    const reply = await service.input(USER, '0000-066717');

    expect(reply?.html).toContain('вже є в системі');
    orders.findByNumber.mockResolvedValue(null);
    const next = await service.input(USER, '0000-066718');
    expect(next?.html).toContain('2/8');
  });

  it('should offer skip on optional steps and not on required ones', async () => {
    service.start(USER);
    expect(service.skip(USER)).toBeNull();

    await fillRequired();

    const skipped = service.skip(USER);
    expect(skipped?.html).toContain('5/8');
    expect(buttonData(skipped)).toEqual([DraftAction.Skip, DraftAction.Cancel]);
  });

  it('should show a summary with normalized values and create the order on confirm', async () => {
    await fillRequired();
    await service.input(USER, '44,9%');
    for (let i = 0; i < 4; i++) service.skip(USER);

    const summary = await service.input(USER, 'ще текст');
    expect(summary?.html).toContain('Натисніть');

    orders.create.mockResolvedValue({ orderNumber: '0000-066717' });
    const done = await service.confirm(USER, 7);

    expect(orders.create).toHaveBeenCalledWith(7, {
      orderNumber: '0000-066717',
      clientName: 'Чернявський Владислав',
      amountDue: '6158.41',
      exchangeRate: '44.9',
    });
    expect(done?.html).toContain('створено');
    expect(service.hasDraft(USER)).toBe(false);
  });

  it("should render the summary in the managers' format", async () => {
    await fillRequired();
    await service.input(USER, '44,9');
    service.skip(USER);
    service.skip(USER);
    service.skip(USER);

    const summary = service.skip(USER);

    expect(summary?.html).toBe(
      [
        '<b>Перевірте замовлення</b>',
        'Номер: 0000-066717',
        'Клієнт: Чернявський Владислав',
        'Сума: 6 158,41 грн',
        'Курс: 44,9',
        'Телефон: —',
        'Рахунок / інвойс: —',
        'Реквізити: —',
        'Коментар: —',
      ].join('\n'),
    );
    expect(buttonData(summary)).toEqual([DraftAction.Confirm, DraftAction.Cancel]);
  });

  it('should not confirm an unfinished draft', async () => {
    service.start(USER);

    await expect(service.confirm(USER, 7)).resolves.toBeNull();
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('should report a number taken between the check and the confirmation', async () => {
    await fillRequired();
    for (let i = 0; i < 5; i++) service.skip(USER);
    orders.create.mockRejectedValue(new OrderNumberTakenError('0000-066717'));

    const reply = await service.confirm(USER, 7);

    expect(reply?.html).toContain('вже є в системі');
  });

  it('should drop the draft on cancel', () => {
    service.start(USER);

    expect(service.cancel(USER).html).toContain('скасовано');
    expect(service.hasDraft(USER)).toBe(false);
  });
});
