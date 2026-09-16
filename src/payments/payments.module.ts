import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { EXTERNAL_API_THROTTLERS } from '../common/guards/external-api-throttle';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: EXTERNAL_API_THROTTLERS })],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
