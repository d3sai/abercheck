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
      providers: [OrderDraftService, { provide: OrdersService, useValue: orders }],
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

    expect(reply?.html).toContain('Курс: —');
    expect(reply?.html).toContain('Коментар: —');
  });

  it('should show a summary with normalized values and create the order on confirm', async () => {
    service.start(USER);

    const summary = await service.input(USER, template());
    expect(summary?.html).toContain('Перевірте замовлення');
    expect(buttonData(summary)).toEqual([DraftAction.Confirm, DraftAction.Cancel]);

    orders.create.mockResolvedValue({ orderNumber: '0000-066717' });
    const done = await service.confirm(USER, 7);

    expect(orders.create).toHaveBeenCalledWith(7, {
      orderNumber: '0000-066717',
      clientName: 'Чернявський Владислав',
      amountDue: '6158.41',
      exchangeRate: '44.9',
      comment: 'Терміново',
    });
    expect(done?.html).toContain('створено');
    expect(service.hasDraft(USER)).toBe(false);
  });

  it("should render the summary in the managers' format", async () => {
    service.start(USER);

    const summary = await service.input(USER, template());

    expect(summary?.html).toBe(
      [
        '<b>Перевірте замовлення</b>',
        'Номер: 0000-066717',
        'ФОП: Чернявський Владислав',
        'Сума: 6 158,41 грн',
        'Курс: 44,9',
        'Коментар: Терміново',
      ].join('\n'),
    );
  });

  it('should not confirm an unfinished draft', async () => {
    service.start(USER);

    await expect(service.confirm(USER, 7)).resolves.toBeNull();
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('should report a number taken between the check and the confirmation', async () => {
    service.start(USER);
    await service.input(USER, template());
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
