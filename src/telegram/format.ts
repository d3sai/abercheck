import type { Prisma } from '../generated/prisma/client';

/** Екранує текст для parse_mode HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 6158.41 → "6 158,41"; ціла сума без копійок: 17675 → "17 675" (як у повідомленнях менеджерів). */
export function formatMoney(value: Prisma.Decimal): string {
  const [integer = '0', fraction] = value.toFixed(2).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction === '00' ? grouped : `${grouped},${fraction}`;
}

const KYIV = new Intl.DateTimeFormat('uk-UA', {
  timeZone: 'Europe/Kyiv',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function kyivParts(date: Date): Record<string, string> {
  return Object.fromEntries(KYIV.formatToParts(date).map((part) => [part.type, part.value]));
}

/** "15:00 03.09.2026" за київським часом. */
export function formatKyivDateTime(date: Date): string {
  const p = kyivParts(date);
  return `${p.hour}:${p.minute} ${p.day}.${p.month}.${p.year}`;
}

/** "03.09.2026" за київським часом. */
export function formatKyivDate(date: Date): string {
  const p = kyivParts(date);
  return `${p.day}.${p.month}.${p.year}`;
}
