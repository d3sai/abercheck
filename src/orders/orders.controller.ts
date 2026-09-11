import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { toUnpaidOrderResponse, type UnpaidOrderResponse } from './dto/unpaid-order.response';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(ApiKeyGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('unpaid')
  async findUnpaid(): Promise<{ data: UnpaidOrderResponse[] }> {
    const unpaid = await this.orders.findUnpaid();
    return { data: unpaid.map(toUnpaidOrderResponse) };
  }
}
