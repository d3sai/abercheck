import { kyivDayStartOf, nextKyivDayStart } from '../../common/kyiv-time';
import type { PeriodRange } from '../reports/stats.service';
import { CabinetErrors } from './cabinet.errors';

const MAX_PERIOD_DAYS = 366;
const DAY_MS = 86_400_000;

export function periodRange(from: string, to: string): PeriodRange {
  const start = kyivDayStartOf(from);
  const end = nextKyivDayStart(kyivDayStartOf(to));
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (!(days >= 1 && days <= MAX_PERIOD_DAYS)) {
    throw CabinetErrors.periodInvalid();
  }
  return { start, end };
}
