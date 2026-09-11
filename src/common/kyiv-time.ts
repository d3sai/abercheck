export const KYIV_TIME_ZONE = 'Europe/Kyiv';

const DAY_MS = 86_400_000;

const PARTS = new Intl.DateTimeFormat('uk-UA', {
  timeZone: KYIV_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const OFFSET = new Intl.DateTimeFormat('en-US', {
  timeZone: KYIV_TIME_ZONE,
  timeZoneName: 'longOffset',
});

export interface KyivParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

export function kyivParts(date: Date): KyivParts {
  const parts = Object.fromEntries(PARTS.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: parts.year ?? '',
    month: parts.month ?? '',
    day: parts.day ?? '',
    hour: parts.hour ?? '',
    minute: parts.minute ?? '',
  };
}

function offsetMinutes(date: Date): number {
  const name = OFFSET.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) {
    return 0;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

export function kyivDayStart(date: Date): Date {
  const { year, month, day } = kyivParts(date);
  const utcMidnight = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return new Date(utcMidnight - offsetMinutes(new Date(utcMidnight)) * 60_000);
}

export function nextKyivDayStart(dayStart: Date): Date {
  return kyivDayStart(new Date(dayStart.getTime() + DAY_MS * 1.5));
}

export function previousKyivDayStart(dayStart: Date): Date {
  return kyivDayStart(new Date(dayStart.getTime() - DAY_MS / 2));
}
