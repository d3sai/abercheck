import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { SessionGuard } from '../auth/session.guard';
import { ManagerRole } from '../generated/prisma/client';
import { OrderNotFoundError } from '../orders/orders.errors';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import {
  type OrderSummaryView,
  type Page,
  type PaymentView,
  toOrderSummary,
  toPaymentView,
} from './cabinet.views';
import { DomainErrorFilter } from './domain-error.filter';
import { AttachPaymentDto } from './dto/cabinet-body.dto';
import { paging, SearchPageQueryDto } from './dto/cabinet-query.dto';

@Controller('cabinet/payments')
@UseGuards(SessionGuard)
@UseFilters(DomainErrorFilter)
export class CabinetPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
  ) {}

  @Get('unmatched')
  async unmatched(@Query() query: SearchPageQueryDto): Promise<Page<PaymentView>> {
    const { payments, total } = await this.payments.findUnmatchedPage({
      text: query.search,
      ...paging(query),
    });
    return {
      items: payments.map(toPaymentView),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  @Post(':id/attach')
  @Roles(ManagerRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async attach(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachPaymentDto,
  ): Promise<OrderSummaryView> {
    const { order } = await this.payments.attach(id, dto.orderNumber);
    const updated = await this.orders.findWithBalanceById(order.id);
    if (!updated) {
      throw new OrderNotFoundError(order.orderNumber);
    }
    return toOrderSummary(updated);
  }
}
