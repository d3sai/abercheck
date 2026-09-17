import { Test } from '@nestjs/testing';
import { OrderStatus, Prisma } from '../../../src/generated/prisma/client';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import type { CreateOrderDto } from '../../../src/modules/orders/dto/create-order.dto';
import {
  OrderNotFoundError,
  OrderNumberTakenError,
} from '../../../src/modules/orders/orders.errors';
import { OrdersService } from '../../../src/modules/orders/orders.service';

const d = (value: string) => new Prisma.Decimal(value);

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('prisma error', { code, clientVersion: 'test' });

describe('OrdersService', () => {
  const order = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  const payment = { groupBy: jest.fn(), findMany: jest.fn() };
  const refund = { groupBy: jest.fn(), findMany: jest.fn() };
  const tx = {
    $queryRaw: jest.fn(),
    order: { findUnique: jest.fn(), update: jest.fn() },
    payment: { aggregate: jest.fn() },
    refund: { aggregate: jest.fn() },
    orderAmountChange: { create: jest.fn() },
  };
  const $transaction = jest.fn<Promise<unknown>, [(client: typeof tx) => Promise<unknown>]>();
  let service: OrdersService;

  const admin = { telegramId: 111n, name: 'Уляна' };

  const dto: CreateOrderDto = {
    orderNumber: 'ЗН-000123',
    clientName: 'Іваненко Іван',
    amountDue: '1250.50',
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: { order, payment, refund, $transaction } },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
    payment.groupBy.mockResolvedValue([]);
    refund.groupBy.mockResolvedValue([]);
    $transaction.mockImplementation((callback) => callback(tx));
    tx.$queryRaw.mockResolvedValue([{ id: 1 }]);
    tx.order.update.mockImplementation(({ data }: { data: object }) => ({ id: 1, ...data }));
    tx.orderAmountChange.create.mockImplementation(({ data }: { data: object }) => ({
      id: 1,
      ...data,
    }));
  });

  afterEach(() => jest.resetAllMocks());

  describe('create', () => {
    it('should attach the order to the manager who created it', async () => {
      order.create.mockResolvedValue({ id: 1 });

      await service.create(7, dto);

      expect(order.create).toHaveBeenCalledWith({ data: { ...dto, managerId: 7 } });
    });

    it('should store the order number in the canonical 1C format', async () => {
      order.create.mockResolvedValue({ id: 1 });

      await service.create(7, { ...dto, orderNumber: '№А 0000-066717' });

      expect(order.create).toHaveBeenCalledWith({
        data: { ...dto, orderNumber: '0000-066717', managerId: 7 },
      });
    });

    it('should throw OrderNumberTakenError when the order number already exists', async () => {
      order.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.create(7, dto)).rejects.toBeInstanceOf(OrderNumberTakenError);
    });

    it('should rethrow unexpected database errors', async () => {
      const error = prismaError('P1001');
      order.create.mockRejectedValue(error);

      await expect(service.create(7, dto)).rejects.toBe(error);
    });
  });

  describe('list', () => {
    it('should filter by manager and statuses, newest first, with the total count', async () => {
      order.findMany.mockResolvedValue([]);
      order.count.mockResolvedValue(42);

      const result = await service.list(
        { managerId: 7, statuses: [OrderStatus.AWAITING_PAYMENT, OrderStatus.PARTIALLY_PAID] },
        25,
      );

      const where = { managerId: 7, status: { in: ['AWAITING_PAYMENT', 'PARTIALLY_PAID'] } };
      expect(order.findMany).toHaveBeenCalledWith({
        where,
        include: { manager: true },
        orderBy: { createdAt: 'desc' },
        take: 25,
      });
      expect(order.count).toHaveBeenCalledWith({ where });
      expect(result).toEqual({ items: [], total: 42 });
    });
  });

  describe('findWithBalance', () => {
    it('should look up the normalized number and subtract refunds', async () => {
      order.findUnique.mockResolvedValue({ id: 1 });
      payment.groupBy.mockResolvedValue([
        { orderId: 1, _sum: { amount: new Prisma.Decimal('6208.41') } },
      ]);
      refund.groupBy.mockResolvedValue([
        { orderId: 1, _sum: { amount: new Prisma.Decimal('50') } },
      ]);

      const result = await service.findWithBalance('№Р 0000-066717');

      expect(order.findUnique).toHaveBeenCalledWith({
        where: { orderNumber: '0000-066717' },
        include: { manager: true },
      });
      expect(result?.amountPaid.toFixed(2)).toBe('6158.41');
    });

    it('should return null for an unknown order', async () => {
      order.findUnique.mockResolvedValue(null);

      await expect(service.findWithBalance('0000-000000')).resolves.toBeNull();
    });
  });

  describe('findUnpaid', () => {
    it('should attach the paid amount to each unpaid order, capped at the limit plus one lookahead', async () => {
      order.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      payment.groupBy.mockResolvedValue([
        { orderId: 1, _sum: { amount: new Prisma.Decimal('3614.32') } },
      ]);

      const result = await service.findUnpaid(50);

      expect(order.findMany).toHaveBeenCalledWith({
        where: { status: { in: ['AWAITING_PAYMENT', 'PARTIALLY_PAID', 'UNDERPAID'] } },
        orderBy: { id: 'asc' },
        take: 51,
      });
      expect(result.items.map((item) => item.amountPaid.toFixed(2))).toEqual(['3614.32', '0.00']);
      expect(result.nextCursor).toBeNull();
    });

    it('should skip the payments query when nothing is unpaid', async () => {
      order.findMany.mockResolvedValue([]);

      await expect(service.findUnpaid(50)).resolves.toEqual({ items: [], nextCursor: null });
      expect(payment.groupBy).not.toHaveBeenCalled();
    });

    it('should return a cursor and drop the lookahead row when there are more pages', async () => {
      order.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const result = await service.findUnpaid(2);

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.order)).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.nextCursor).toBe(2);
    });

    it('should resume after the given cursor', async () => {
      order.findMany.mockResolvedValue([]);

      await service.findUnpaid(50, 7);

      expect(order.findMany).toHaveBeenCalledWith({
        where: { status: { in: ['AWAITING_PAYMENT', 'PARTIALLY_PAID', 'UNDERPAID'] } },
        orderBy: { id: 'asc' },
        take: 51,
        cursor: { id: 7 },
        skip: 1,
      });
    });
  });

  describe('update', () => {
    it('should throw OrderNotFoundError when the order does not exist', async () => {
      order.update.mockRejectedValue(prismaError('P2025'));

      await expect(service.update('404', { comment: 'x' }, admin)).rejects.toBeInstanceOf(
        OrderNotFoundError,
      );
    });

    it('should update fields directly without a transaction when amountDue is unchanged', async () => {
      order.update.mockResolvedValue({ id: 1, comment: 'x' });

      await service.update('0000-066717', { comment: 'x' }, admin);

      expect(order.update).toHaveBeenCalledWith({
        where: { orderNumber: '0000-066717' },
        data: { comment: 'x' },
      });
      expect($transaction).not.toHaveBeenCalled();
    });

    it('should recalculate the status, persist the new amount and record the audit trail', async () => {
      tx.order.findUnique.mockResolvedValue({
        id: 1,
        orderNumber: '0000-066717',
        amountDue: d('100'),
        status: OrderStatus.PAID,
      });
      tx.payment.aggregate.mockResolvedValue({ _sum: { amount: d('100') } });
      tx.refund.aggregate.mockResolvedValue({ _sum: { amount: null } });

      await service.update('0000-066717', { amountDue: '150' }, admin);

      expect(tx.orderAmountChange.create).toHaveBeenCalledWith({
        data: {
          orderId: 1,
          previousAmountDue: d('100'),
          newAmountDue: d('150'),
          changedByTelegramId: admin.telegramId,
          changedByName: admin.name,
        },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { amountDue: d('150'), status: OrderStatus.PARTIALLY_PAID },
      });
    });

    it('should throw OrderNotFoundError when amending the amount of an unknown order', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      tx.order.findUnique.mockResolvedValue(null);

      await expect(service.update('404', { amountDue: '150' }, admin)).rejects.toBeInstanceOf(
        OrderNotFoundError,
      );
      expect(tx.orderAmountChange.create).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      order.findMany.mockResolvedValue([]);
      order.count.mockResolvedValue(0);
    });

    it('should match number, client, invoice and phone within the filters', async () => {
      await service.search({
        managerId: 7,
        statuses: [OrderStatus.PAID],
        text: '0667',
        sort: 'amountDue',
        direction: 'asc',
        skip: 25,
        take: 25,
      });

      const where = {
        managerId: 7,
        status: { in: ['PAID'] },
        OR: [
          { orderNumber: { contains: '0667', mode: 'insensitive' } },
          { clientName: { contains: '0667', mode: 'insensitive' } },
          { invoiceNumber: { contains: '0667', mode: 'insensitive' } },
          { clientPhone: { contains: '0667' } },
        ],
      };
      expect(order.findMany).toHaveBeenCalledWith({
        where,
        include: { manager: true },
        orderBy: [{ amountDue: 'asc' }, { id: 'asc' }],
        skip: 25,
        take: 25,
      });
      expect(order.count).toHaveBeenCalledWith({ where });
    });

    it('should not filter when no criteria are given', async () => {
      await service.search({ sort: 'createdAt', direction: 'desc', skip: 0, take: 25 });

      expect(order.count).toHaveBeenCalledWith({ where: {} });
    });

    it('should treat an empty status list as no status filter', async () => {
      await service.search({
        statuses: [],
        sort: 'createdAt',
        direction: 'desc',
        skip: 0,
        take: 25,
      });

      expect(order.count).toHaveBeenCalledWith({ where: {} });
    });
  });

  describe('findLedger', () => {
    it('should return the order with its payments and refunds in time order', async () => {
      order.findUnique.mockResolvedValue({ id: 1 });
      payment.findMany.mockResolvedValue([{ id: 10 }]);
      refund.findMany.mockResolvedValue([{ id: 20 }]);

      const ledger = await service.findLedger('0000-066717');

      expect(payment.findMany).toHaveBeenCalledWith({
        where: { orderId: 1 },
        orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      });
      expect(refund.findMany).toHaveBeenCalledWith({
        where: { orderId: 1 },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(ledger).toMatchObject({
        order: { id: 1 },
        payments: [{ id: 10 }],
        refunds: [{ id: 20 }],
      });
    });

    it('should return null for an unknown order', async () => {
      order.findUnique.mockResolvedValue(null);

      await expect(service.findLedger('0000-000000')).resolves.toBeNull();
      expect(payment.findMany).not.toHaveBeenCalled();
    });
  });
});
