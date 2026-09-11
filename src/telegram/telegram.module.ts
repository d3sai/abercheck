import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import type { EnvironmentVariables } from '../config/env.validation';
import { ManagersModule } from '../managers/managers.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { RefundsModule } from '../refunds/refunds.module';
import { ReportsModule } from '../reports/reports.module';
import { AdminFlowService } from './admin/admin-flow.service';
import { AdminUpdate } from './admin/admin.update';
import { BotUpdate } from './bot.update';
import { DailyReportJob } from './daily-report.job';
import { PaymentNotifier } from './notifications/payment-notifier';
import { OrderDraftService } from './order-draft/order-draft.service';
import { OrderListService } from './order-list.service';
import { TelegramSender } from './telegram-sender';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        token: config.get('TELEGRAM_BOT_TOKEN', { infer: true }),
        include: [TelegramModule],
      }),
    }),
    ManagersModule,
    OrdersModule,
    PaymentsModule,
    RefundsModule,
    ReportsModule,
  ],
  providers: [
    BotUpdate,
    AdminUpdate,
    TelegramSender,
    PaymentNotifier,
    OrderDraftService,
    OrderListService,
    AdminFlowService,
    DailyReportJob,
  ],
})
export class TelegramModule {}
