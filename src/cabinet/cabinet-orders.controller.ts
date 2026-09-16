import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CurrentManager, Roles } from '../auth/auth.decorators';
import { AuthErrors } from '../auth/auth.errors';
import { SessionGuard } from '../auth/session.guard';
import { type Manager, ManagerRole, ManagerStatus } from '../generated/prisma/client';
import { ManagersService } from '../managers/managers.service';
import { UpdateOrderDto } from '../orders/dto/update-order.dto';
import { OrderNotFoundError } from '../orders/orders.errors';
import { type OrderLedger, OrdersService } from '../orders/orders.service';
import { RefundsService } from '../refunds/refunds.service';
import { canAccessOrder, initiatorOf, isAdmin, ownOrdersOf } from './cabinet-access';
import { CabinetErrors } from './cabinet.errors';
import {
  type OrderDetailView,
  type OrderSummaryView,
  type Page,
  toOrderDetail,
  toOrderSummary,
} from './cabinet.views';
import { DomainErrorFilter } from './domain-error.filter';
import { CabinetCreateOrderDto, RefundDto } from './dto/cabinet-body.dto';
import { OrdersQueryDto, paging } from './dto/cabinet-query.dto';

@Controller('cabinet/orders')
@UseGuards(SessionGuard)
@UseFilters(DomainErrorFilter)
export class CabinetOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly managers: ManagersService,
    private readonly refunds: RefundsService,
  ) {}

  @Get()
  async list(
    @CurrentManager() me: Manager,
    @Query() query: OrdersQueryDto,
  ): Promise<Page<OrderSummaryView>> {
    const { items, total } = await this.orders.search({
      managerId: ownOrdersOf(me) ?? query.managerId,
      statuses: query.status,
      text: query.search,
      sort: query.sort,
      direction: query.direction,
      ...paging(query),
    });
    return {
      items: items.map(toOrderSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  @Get(':orderNumber')
  async detail(
    @CurrentManager() me: Manager,
    @Param('orderNumber') orderNumber: string,
  ): Promise<OrderDetailView> {
    return toOrderDetail(await this.ledger(me, orderNumber));
  }

  @Post()
  async create(
    @CurrentManager() me: Manager,
    @Body() { managerId, ...dto }: CabinetCreateOrderDto,
  ): Promise<OrderDetailView> {
    const order = await this.orders.create(await this.ownerFor(me, managerId), dto);
    return toOrderDetail(await this.ledger(me, order.orderNumber));
  }

  @Patch(':orderNumber')
  async update(
    @CurrentManager() me: Manager,
    @Param('orderNumber') orderNumber: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<OrderDetailView> {
    if (dto.amountDue !== undefined && !isAdmin(me)) {
      throw AuthErrors.forbidden();
    }
    const { order } = await this.ledger(me, orderNumber);
    await this.orders.update(order.orderNumber, dto, initiatorOf(me));
    return toOrderDetail(await this.ledger(me, order.orderNumber));
  }

  @Post(':orderNumber/refunds')
  @Roles(ManagerRole.ADMIN)
  async refund(
    @CurrentManager() me: Manager,
    @Param('orderNumber') orderNumber: string,
    @Body() dto: RefundDto,
  ): Promise<OrderDetailView> {
    const { order } = await this.ledger(me, orderNumber);
    await this.refunds.refund(order.id, dto.amount ?? null, initiatorOf(me));
    return toOrderDetail(await this.ledger(me, order.orderNumber));
  }

  @Post(':orderNumber/cancel')
  @Roles(ManagerRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentManager() me: Manager,
    @Param('orderNumber') orderNumber: string,
  ): Promise<OrderDetailView> {
    const { order } = await this.ledger(me, orderNumber);
    await this.refunds.cancelUnpaid(order.id, initiatorOf(me));
    return toOrderDetail(await this.ledger(me, order.orderNumber));
  }

  /** Someone else's order is reported as missing so managers can't probe order numbers. */
  private async ledger(me: Manager, orderNumber: string): Promise<OrderLedger> {
    const ledger = await this.orders.findLedger(orderNumber);
    if (!ledger || !canAccessOrder(me, ledger.order)) {
      throw new OrderNotFoundError(orderNumber);
    }
    return ledger;
  }

  private async ownerFor(me: Manager, managerId: number | undefined): Promise<number> {
    if (managerId === undefined || managerId === me.id) {
      return me.id;
    }
    if (!isAdmin(me)) {
      throw AuthErrors.forbidden();
    }
    const owner = await this.managers.findById(managerId);
    if (owner?.status !== ManagerStatus.ACTIVE) {
      throw CabinetErrors.managerNotActive();
    }
    return owner.id;
  }
}
