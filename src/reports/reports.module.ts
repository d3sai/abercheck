import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DailyReportService } from './daily-report.service';

@Module({
  imports: [OrdersModule],
  providers: [DailyReportService],
  exports: [DailyReportService],
})
export class ReportsModule {}
