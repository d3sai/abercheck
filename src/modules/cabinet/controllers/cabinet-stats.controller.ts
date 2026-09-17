import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentManager } from '../../auth/auth.decorators';
import { SessionGuard } from '../../auth/session.guard';
import type { Manager } from '../../../generated/prisma/client';
import { ActivityService } from '../../reports/activity.service';
import { StatsService } from '../../reports/stats.service';
import { ownOrdersOf } from '../cabinet-access';
import {
  type ActivityView,
  type PeriodView,
  type SnapshotView,
  toActivityView,
  toPeriodView,
  toSnapshotView,
} from '../cabinet.views';
import { LimitQueryDto, PeriodQueryDto } from '../dto/cabinet-query.dto';
import { periodRange } from '../period';

@Controller('cabinet')
@UseGuards(SessionGuard)
export class CabinetStatsController {
  constructor(
    private readonly stats: StatsService,
    private readonly activity: ActivityService,
  ) {}

  @Get('stats/snapshot')
  async snapshot(@CurrentManager() me: Manager): Promise<SnapshotView> {
    return toSnapshotView(await this.stats.snapshot(ownOrdersOf(me)));
  }

  @Get('stats/period')
  async period(
    @CurrentManager() me: Manager,
    @Query() { from, to }: PeriodQueryDto,
  ): Promise<PeriodView> {
    const stats = await this.stats.period(periodRange(from, to), ownOrdersOf(me));
    return toPeriodView(from, to, stats);
  }

  @Get('activity')
  async recent(
    @CurrentManager() me: Manager,
    @Query() { limit }: LimitQueryDto,
  ): Promise<ActivityView[]> {
    return (await this.activity.recent(limit, ownOrdersOf(me))).map(toActivityView);
  }
}
