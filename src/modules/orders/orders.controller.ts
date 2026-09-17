import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { FindUnpaidQueryDto } from './dto/find-unpaid-query.dto';
import { toUnpaidOrderResponse, type UnpaidOrderResponse } from './dto/unpaid-order.response';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(ApiKeyGuard, ThrottlerGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('unpaid')
  async findUnpaid(
    @Query() { limit, cursor }: FindUnpaidQueryDto,
  ): Promise<{ data: UnpaidOrderResponse[]; next_cursor: number | null }> {
    const { items, nextCursor } = await this.orders.findUnpaid(limit, cursor);
    return { data: items.map(toUnpaidOrderResponse), next_cursor: nextCursor };
  }
}
