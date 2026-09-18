import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type Manager,
  type Order,
  type OrderStatus,
  type Payment,
  Prisma,
  type Refund,
} from '../../generated/prisma/client';
import { isRecordNotFound, isUniqueViolation } from '../../common/prisma/prisma-errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Initiator } from '../refunds/refund.events';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { UpdateOrderDto } from './dto/update-order.dto';
import { lockOrderByNumber, netPaid } from './order-ledger';
import { normalizeOrderNumber } from './order-number';
import { type OrderCreated, OrderEvents } from './order.events';
import { calculateOrderStatus, UNPAID_STATUSES } from './order-status';
import { OrderNotFoundError, OrderNumberTakenError } from './orders.errors';

export interface OrderFilter {
  managerId?: number;
  statuses?: OrderStatus[];
}

export interface OrderWithPaid<T extends Order = Order> {
  order: T;
  amountPaid: Prisma.Decimal;
}

export type OrderWithManager = Order & { manager: Manager };

export type OrderSort = 'createdAt' | 'amountDue' | 'orderNumber';

export interface OrderSearch extends OrderFilter {
  text?: string;
  sort: OrderSort;
  direction: Prisma.SortOrder;
  skip: number;
  take: number;
}

export interface OrderLedger extends OrderWithPaid<OrderWithManager> {
  payments: Payment[];
  refunds: Refund[];
}

function orderBy(sort: OrderSort, direction: Prisma.SortOrder) {
  switch (sort) {
    case 'amountDue':
      return [{ amountDue: direction }, { id: direction }];
    case 'orderNumber':
      return [{ orderNumber: direction }];
    case 'createdAt':
      return [{ createdAt: direction }, { id: direction }];
  }
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(managerId: number, dto: CreateOrderDto): Promise<Order> {
    const orderNumber = normalizeOrderNumber(dto.orderNumber);
    let order: Order;
    try {
      order = await this.prisma.order.create({ data: { ...dto, orderNumber, managerId } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new OrderNumberTakenError(orderNumber);
      }
      throw error;
    }
    this.events.emit(OrderEvents.Created, { order } satisfies OrderCreated);
    return order;
  }

  async findUnpaid(
    limit: number,
    cursor?: number,
  ): Promise<{ items: OrderWithPaid[]; nextCursor: number | null }> {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: UNPAID_STATUSES } },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = orders.length > limit;
    const page = hasMore ? orders.slice(0, limit) : orders;
    const nextCursor = hasMore ? page[page.length - 1]!.id : null;
    return { items: await this.withBalances(page), nextCursor };
  }

  findByNumber(orderNumber: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { orderNumber } });
  }

  findWithBalance(orderNumber: string): Promise<OrderWithPaid<OrderWithManager> | null> {
    return this.findOneWithBalance({ orderNumber: normalizeOrderNumber(orderNumber) });
  }

  findWithBalanceById(id: number): Promise<OrderWithPaid<OrderWithManager> | null> {
    return this.findOneWithBalance({ id });
  }

  async findManyWithBalance(ids: number[]): Promise<OrderWithPaid<OrderWithManager>[]> {
    if (ids.length === 0) {
      return [];
    }
    const orders = await this.prisma.order.findMany({
      where: { id: { in: ids } },
      include: { manager: true },
      orderBy: { orderNumber: 'asc' },
    });
    return this.withBalances(orders);
  }

  async list(
    { managerId, statuses }: OrderFilter,
    limit: number,
  ): Promise<{ items: OrderWithPaid<OrderWithManager>[]; total: number }> {
    const where = { managerId, status: statuses ? { in: statuses } : undefined };
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { manager: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: await this.withBalances(orders), total };
  }

  async search({
    managerId,
    statuses,
    text,
    sort,
    direction,
    skip,
    take,
  }: OrderSearch): Promise<{ items: OrderWithPaid<OrderWithManager>[]; total: number }> {
    const where: Prisma.OrderWhereInput = {
      managerId,
      status: statuses?.length ? { in: statuses } : undefined,
      OR: text
        ? [
            { orderNumber: { contains: text, mode: 'insensitive' } },
            { clientName: { contains: text, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { manager: true },
        orderBy: orderBy(sort, direction),
        skip,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: await this.withBalances(orders), total };
  }

  async findLedger(orderNumber: string): Promise<OrderLedger | null> {
    const found = await this.findWithBalance(orderNumber);
    if (!found) {
      return null;
    }
    const orderId = found.order.id;
    const [payments, refunds] = await Promise.all([
      this.prisma.payment.findMany({
        where: { orderId },
        orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.refund.findMany({
        where: { orderId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return { ...found, payments, refunds };
  }

  async update(orderNumber: string, dto: UpdateOrderDto, initiator: Initiator): Promise<Order> {
    const { amountDue } = dto;
    if (amountDue === undefined) {
      try {
        return await this.prisma.order.update({ where: { orderNumber }, data: dto });
      } catch (error) {
        if (isRecordNotFound(error)) {
          throw new OrderNotFoundError(orderNumber);
        }
        throw error;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await lockOrderByNumber(tx, orderNumber);
      if (!order) {
        throw new OrderNotFoundError(orderNumber);
      }

      const newAmountDue = new Prisma.Decimal(amountDue);
      const paid = await netPaid(tx, order.id);
      const status = calculateOrderStatus(newAmountDue, paid, order.status);

      await tx.orderAmountChange.create({
        data: {
          orderId: order.id,
          previousAmountDue: order.amountDue,
          newAmountDue,
          changedByTelegramId: initiator.telegramId,
          changedByName: initiator.name,
        },
      });

      return tx.order.update({
        where: { id: order.id },
        data: { ...dto, amountDue: newAmountDue, status },
      });
    });
  }

  private async findOneWithBalance(
    where: Prisma.OrderWhereUniqueInput,
  ): Promise<OrderWithPaid<OrderWithManager> | null> {
    const order = await this.prisma.order.findUnique({ where, include: { manager: true } });
    if (!order) {
      return null;
    }
    const [withBalance] = await this.withBalances([order]);
    return withBalance ?? null;
  }

  private async withBalances<T extends Order>(orders: T[]): Promise<OrderWithPaid<T>[]> {
    if (orders.length === 0) {
      return [];
    }
    const where = { orderId: { in: orders.map((order) => order.id) } };
    const [payments, refunds] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['orderId'], where, _sum: { amount: true } }),
      this.prisma.refund.groupBy({ by: ['orderId'], where, _sum: { amount: true } }),
    ]);

    const zero = new Prisma.Decimal(0);
    const paid = new Map(payments.map((sum) => [sum.orderId, sum._sum.amount ?? zero]));
    const refunded = new Map(refunds.map((sum) => [sum.orderId, sum._sum.amount ?? zero]));

    return orders.map((order) => ({
      order,
      amountPaid: (paid.get(order.id) ?? zero).minus(refunded.get(order.id) ?? zero),
    }));
  }
}
