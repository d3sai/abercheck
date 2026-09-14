import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ManagersModule } from '../managers/managers.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { RefundsModule } from '../refunds/refunds.module';
import { ReportsModule } from '../reports/reports.module';
import { CabinetManagersController } from './cabinet-managers.controller';
import { CabinetOrdersController } from './cabinet-orders.controller';
import { CabinetPaymentsController } from './cabinet-payments.controller';
import { CabinetStatsController } from './cabinet-stats.controller';

@Module({
  imports: [AuthModule, ManagersModule, OrdersModule, PaymentsModule, RefundsModule, ReportsModule],
  controllers: [
    CabinetOrdersController,
    CabinetPaymentsController,
    CabinetManagersController,
    CabinetStatsController,
  ],
})
export class CabinetModule {}
