import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ActivityService } from './activity.service';
import { DailyReportService } from './daily-report.service';
import { StatsService } from './stats.service';

@Module({
  imports: [OrdersModule],
  providers: [DailyReportService, StatsService, ActivityService],
  exports: [DailyReportService, StatsService, ActivityService],
})
export class ReportsModule {}
