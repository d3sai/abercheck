import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { MatchType, OrderStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentEvents } from './payment-ingestion.types';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const dto: CreatePaymentDto = {
    external_transaction_id: 'tx-1',
    order_number: '№А 0000-066717',
    amount: '3614.32',
    payer_name: 'Чернявський Владислав',
    receiving_account: 'ФОП Гук В.С',
    purpose_text: 'Оплата за замовлення',
    paid_at: '2026-09-03T15:00:00+03:00',
  };
  const order = {
    id: 10,
    orderNumber: '0000-066717',
    amountDue: new Prisma.Decimal('6158.41'),
    status: OrderStatus.AWAITING_PAYMENT,
  };

  const tx = {
    $queryRaw: jest.fn(),
    order: { findUnique: jest.fn(), update: jest.fn() },
    payment: { create: jest.fn(), aggregate: jest.fn() },
  };
  const prisma = {
    payment: { findUnique: jest.fn() },
    $transaction: jest.fn<Promise<unknown>, [(client: typeof tx) => Promise<unknown>]>((callback) =>
      callback(tx),
    ),
  };
  const events = { emit: jest.fn() };
  let service: PaymentsService;

  const paidSoFar = (amount: string) =>
    tx.payment.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(amount) } });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
    prisma.payment.findUnique.mockResolvedValue(null);
    tx.$queryRaw.mockResolvedValue([{ id: order.id }]);
    tx.order.findUnique.mockResolvedValue(order);
    tx.payment.create.mockImplementation(({ data }: { data: object }) => ({ id: 1, ...data }));
    tx.order.update.mockImplementation(({ data }: { data: object }) => ({ ...order, ...data }));
  });

  afterEach(() => jest.clearAllMocks());

  it('should record a partial payment against the normalized order number', async () => {
    paidSoFar('3614.32');

    const result = await service.ingest(dto);

    expect(result).toMatchObject({
      kind: 'recorded',
      previousStatus: OrderStatus.AWAITING_PAYMENT,
      order: { status: OrderStatus.PARTIALLY_PAID },
    });
    expect(tx.$queryRaw.mock.calls[0]).toContain('0000-066717');
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: order.id,
        reportedOrderNumber: '№А 0000-066717',
        matchType: MatchType.MATCHED_BY_PROVIDER,
        paidAt: new Date('2026-09-03T12:00:00Z'),
      }) as unknown,
    });
    expect(events.emit).toHaveBeenCalledWith(PaymentEvents.Recorded, result);
  });

  it('should mark the order paid when the second transfer covers the rest', async () => {
    tx.order.findUnique.mockResolvedValue({ ...order, status: OrderStatus.PARTIALLY_PAID });
    paidSoFar('6158.41');

    const result = await service.ingest({ ...dto, external_transaction_id: 'tx-2' });

    expect(result).toMatchObject({ kind: 'recorded', order: { status: OrderStatus.PAID } });
  });

  it('should not rewrite the order when its status stays the same', async () => {
    tx.order.findUnique.mockResolvedValue({ ...order, status: OrderStatus.PARTIALLY_PAID });
    paidSoFar('5000');

    await service.ingest(dto);

    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('should keep a payment for an unknown order for manual review', async () => {
    tx.$queryRaw.mockResolvedValue([]);

    const result = await service.ingest(dto);

    expect(result.kind).toBe('unmatched');
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: null, matchType: MatchType.MANUAL }) as unknown,
    });
    expect(tx.payment.aggregate).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(PaymentEvents.Unmatched, result);
  });

  it('should not look up an order when the provider sent no order number', async () => {
    const result = await service.ingest({ ...dto, order_number: null });

    expect(result.kind).toBe('unmatched');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('should return an already processed transaction without side effects', async () => {
    prisma.payment.findUnique.mockResolvedValue({ id: 1 });

    const result = await service.ingest(dto);

    expect(result).toEqual({ kind: 'duplicate', payment: { id: 1 } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('should treat a concurrent insert of the same transaction as a duplicate', async () => {
    prisma.payment.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 });
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(service.ingest(dto)).resolves.toEqual({ kind: 'duplicate', payment: { id: 1 } });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('should rethrow unexpected database errors', async () => {
    const error = new Error('connection lost');
    prisma.$transaction.mockRejectedValueOnce(error);

    await expect(service.ingest(dto)).rejects.toBe(error);
  });
});
