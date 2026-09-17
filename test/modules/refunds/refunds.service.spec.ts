import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { OrderStatus, Prisma, RefundType } from '../../../src/generated/prisma/client';
import { OrderCancelledError, OrderNotFoundError } from '../../../src/modules/orders/orders.errors';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { RefundEvents } from '../../../src/modules/refunds/refund.events';
import {
  NothingToRefundError,
  OrderHasPaymentsError,
  RefundAmountError,
} from '../../../src/modules/refunds/refunds.errors';
import { RefundsService } from '../../../src/modules/refunds/refunds.service';

const d = (value: string) => new Prisma.Decimal(value);

describe('RefundsService', () => {
  const admin = { telegramId: 111n, name: 'Уляна' };
  const order = {
    id: 1,
    orderNumber: '0000-066717',
    amountDue: d('6158.41'),
    status: OrderStatus.OVERPAID,
  };
  const tx = {
    $queryRaw: jest.fn(),
    order: { findUnique: jest.fn(), update: jest.fn() },
    payment: { aggregate: jest.fn() },
    refund: { aggregate: jest.fn(), create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn<Promise<unknown>, [(client: typeof tx) => Promise<unknown>]>(),
  };
  const events = { emit: jest.fn() };
  let service: RefundsService;

  const balance = (paid: string, refunded: string | null = null) => {
    tx.payment.aggregate.mockResolvedValue({ _sum: { amount: d(paid) } });
    tx.refund.aggregate.mockResolvedValue({ _sum: { amount: refunded ? d(refunded) : null } });
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = moduleRef.get(RefundsService);
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    tx.$queryRaw.mockResolvedValue([{ id: order.id }]);
    tx.order.findUnique.mockResolvedValue(order);
    tx.order.update.mockImplementation(({ data }: { data: object }) => ({ ...order, ...data }));
    tx.refund.create.mockImplementation(({ data }: { data: object }) => ({ id: 1, ...data }));
  });

  afterEach(() => jest.resetAllMocks());

  describe('refund', () => {
    it('should mark the order paid after returning the overpayment', async () => {
      balance('6208.41');

      const result = await service.refund(order.id, '50', admin);

      expect(tx.refund.create).toHaveBeenCalledWith({
        data: {
          orderId: 1,
          amount: d('50'),
          type: RefundType.PARTIAL,
          initiatedByTelegramId: 111n,
          initiatedByName: 'Уляна',
        },
      });
      expect(result.order.status).toBe(OrderStatus.PAID);
      expect(result.amountPaid.toFixed(2)).toBe('6158.41');
      expect(events.emit).toHaveBeenCalledWith(RefundEvents.Recorded, result);
    });

    it('should cancel the order when everything received is returned', async () => {
      balance('6208.41');

      const result = await service.refund(order.id, null, admin);

      expect(result.refund).toMatchObject({ amount: d('6208.41'), type: RefundType.FULL });
      expect(result.order.status).toBe(OrderStatus.CANCELLED);
      expect(result.previousStatus).toBe(OrderStatus.OVERPAID);
    });

    it('should treat an explicit amount equal to the balance as a full refund', async () => {
      balance('6208.41', '50');

      const result = await service.refund(order.id, '6158.41', admin);

      expect(result.refund.type).toBe(RefundType.FULL);
      expect(result.order.status).toBe(OrderStatus.CANCELLED);
    });

    it('should reopen a paid order as partially paid after a partial refund', async () => {
      tx.order.findUnique.mockResolvedValue({ ...order, status: OrderStatus.PAID });
      balance('6158.41');

      const result = await service.refund(order.id, '1000', admin);

      expect(result.order.status).toBe(OrderStatus.PARTIALLY_PAID);
    });

    it.each(['0', '6208.42'])('should reject an amount of %s', async (amount) => {
      balance('6208.41');

      await expect(service.refund(order.id, amount, admin)).rejects.toBeInstanceOf(
        RefundAmountError,
      );
      expect(tx.refund.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('should refuse when nothing was received', async () => {
      balance('100', '100');

      await expect(service.refund(order.id, null, admin)).rejects.toBeInstanceOf(
        NothingToRefundError,
      );
    });

    it('should refuse an unknown order', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      await expect(service.refund(99, null, admin)).rejects.toBeInstanceOf(OrderNotFoundError);
    });
  });

  describe('cancelUnpaid', () => {
    it('should cancel an order nobody paid for', async () => {
      tx.order.findUnique.mockResolvedValue({ ...order, status: OrderStatus.AWAITING_PAYMENT });
      tx.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
      tx.refund.aggregate.mockResolvedValue({ _sum: { amount: null } });

      const result = await service.cancelUnpaid(order.id, admin);

      expect(result.order.status).toBe(OrderStatus.CANCELLED);
      expect(events.emit).toHaveBeenCalledWith(RefundEvents.OrderCancelled, result);
    });

    it('should require a refund when money was received', async () => {
      balance('100');

      await expect(service.cancelUnpaid(order.id, admin)).rejects.toBeInstanceOf(
        OrderHasPaymentsError,
      );
    });

    it('should refuse an already cancelled order', async () => {
      tx.order.findUnique.mockResolvedValue({ ...order, status: OrderStatus.CANCELLED });

      await expect(service.cancelUnpaid(order.id, admin)).rejects.toBeInstanceOf(
        OrderCancelledError,
      );
    });
  });
});
