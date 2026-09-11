import { Injectable } from '@nestjs/common';
import { type Order, type OrderStatus, Prisma } from '../generated/prisma/client';
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

export interface OrderWithPaid {
  order: Order;
  amountPaid: Prisma.Decimal;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(managerId: number, dto: CreateOrderDto): Promise<Order> {
    // Той самий формат, за яким шукаємо замовлення при надходженні платежу.
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

  /** Неоплачені замовлення разом із уже сплаченою сумою — для сервісу-джерела платежів. */
  async findUnpaid(): Promise<OrderWithPaid[]> {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: UNPAID_STATUSES } },
      orderBy: { createdAt: 'asc' },
    });
    if (orders.length === 0) {
      return [];
    }

    const sums = await this.prisma.payment.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orders.map((order) => order.id) } },
      _sum: { amount: true },
    });
    const paidByOrder = new Map(sums.map((sum) => [sum.orderId, sum._sum.amount]));

    return orders.map((order) => ({
      order,
      amountPaid: paidByOrder.get(order.id) ?? new Prisma.Decimal(0),
    }));
  }

  findByNumber(orderNumber: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { orderNumber } });
  }

  findMany({ managerId, statuses }: OrderFilter = {}): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { managerId, status: statuses ? { in: statuses } : undefined },
      orderBy: { createdAt: 'desc' },
    });
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
}
