import { Injectable } from '@nestjs/common';
import {
  type Manager,
  type Order,
  type OrderStatus,
  type Payment,
  Prisma,
  type Refund,
} from '../generated/prisma/client';
import { isRecordNotFound, isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { UpdateOrderDto } from './dto/update-order.dto';
import { normalizeOrderNumber } from './order-number';
import { UNPAID_STATUSES } from './order-status';
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
  constructor(private readonly prisma: PrismaService) {}

  async create(managerId: number, dto: CreateOrderDto): Promise<Order> {
    const orderNumber = normalizeOrderNumber(dto.orderNumber);
    try {
      return await this.prisma.order.create({ data: { ...dto, orderNumber, managerId } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new OrderNumberTakenError(orderNumber);
      }
      throw error;
    }
  }

  async findUnpaid(): Promise<OrderWithPaid[]> {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: UNPAID_STATUSES } },
      orderBy: { createdAt: 'asc' },
    });
    return this.withBalances(orders);
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
            { invoiceNumber: { contains: text, mode: 'insensitive' } },
            { clientPhone: { contains: text } },
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

  async update(orderNumber: string, dto: UpdateOrderDto): Promise<Order> {
    try {
      return await this.prisma.order.update({ where: { orderNumber }, data: dto });
    } catch (error) {
      if (isRecordNotFound(error)) {
        throw new OrderNotFoundError(orderNumber);
      }
      throw error;
    }
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
