import { Injectable } from '@nestjs/common';
import type { Order, OrderStatus } from '../generated/prisma/client';
import { isRecordNotFound, isUniqueViolation } from '../prisma/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { UpdateOrderDto } from './dto/update-order.dto';
import { OrderNotFoundError, OrderNumberTakenError } from './orders.errors';

export interface OrderFilter {
  managerId?: number;
  statuses?: OrderStatus[];
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(managerId: number, dto: CreateOrderDto): Promise<Order> {
    try {
      return await this.prisma.order.create({ data: { ...dto, managerId } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new OrderNumberTakenError(dto.orderNumber);
      }
      throw error;
    }
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
