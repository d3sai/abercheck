import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import type { EnvironmentVariables } from '../config/env.validation';
import { ManagersModule } from '../managers/managers.module';
import { OrdersModule } from '../orders/orders.module';
import { BotUpdate } from './bot.update';
import { PaymentNotifier } from './notifications/payment-notifier';
import { OrderDraftService } from './order-draft/order-draft.service';
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
  ],
  providers: [BotUpdate, TelegramSender, PaymentNotifier, OrderDraftService],
})
export class TelegramModule {}
