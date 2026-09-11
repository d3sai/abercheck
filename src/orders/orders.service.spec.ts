import { Test } from '@nestjs/testing';
import { OrderStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateOrderDto } from './dto/create-order.dto';
import { OrderNotFoundError, OrderNumberTakenError } from './orders.errors';
import { OrdersService } from './orders.service';

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
  const payment = { groupBy: jest.fn() };
  const refund = { groupBy: jest.fn() };
  let service: OrdersService;

  const dto: CreateOrderDto = {
    orderNumber: 'ЗН-000123',
    clientName: 'Іваненко Іван',
    amountDue: '1250.50',
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: { order, payment, refund } }],
    }).compile();

    service = moduleRef.get(OrdersService);
    payment.groupBy.mockResolvedValue([]);
    refund.groupBy.mockResolvedValue([]);
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
    it('should attach the paid amount to each unpaid order', async () => {
      order.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      payment.groupBy.mockResolvedValue([
        { orderId: 1, _sum: { amount: new Prisma.Decimal('3614.32') } },
      ]);

      const result = await service.findUnpaid();

      expect(order.findMany).toHaveBeenCalledWith({
        where: { status: { in: ['AWAITING_PAYMENT', 'PARTIALLY_PAID', 'UNDERPAID'] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(result.map((item) => item.amountPaid.toFixed(2))).toEqual(['3614.32', '0.00']);
    });

    it('should skip the payments query when nothing is unpaid', async () => {
      order.findMany.mockResolvedValue([]);

      await expect(service.findUnpaid()).resolves.toEqual([]);
      expect(payment.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should throw OrderNotFoundError when the order does not exist', async () => {
      order.update.mockRejectedValue(prismaError('P2025'));

      await expect(service.update('404', { comment: 'x' })).rejects.toBeInstanceOf(
        OrderNotFoundError,
      );
    });
  });
});
