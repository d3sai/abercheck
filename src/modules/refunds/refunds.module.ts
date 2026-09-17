import { Module } from '@nestjs/common';
import { RefundsService } from './refunds.service';

@Module({
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
