import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { EXTERNAL_API_THROTTLERS } from '../../common/guards/external-api-throttle';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: EXTERNAL_API_THROTTLERS })],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
