import { MONEY_PATTERN } from '../../../common/money';
import { EXCHANGE_RATE_PATTERN } from '../../orders/dto/create-order.dto';
import { normalizeOrderNumber } from '../../orders/order-number';

export type ParseResult = { ok: true; value: string } | { ok: false; error: string };

const ok = (value: string): ParseResult => ({ ok: true, value });
const fail = (error: string): ParseResult => ({ ok: false, error });

export function parseOrderNumber(input: string): ParseResult {
  const value = normalizeOrderNumber(input);
  return /^\d{4}-\d{6}$/.test(value) ? ok(value) : fail('Номер має бути у форматі 0000-066717.');
}

function parseDecimal(input: string, suffix: RegExp): string | null {
  const compact = input.replace(suffix, '').replace(/[\s\u00a0\u202f]/g, '');
  if (compact.includes(',') && compact.includes('.')) {
    return null;
  }
  return compact.replace(',', '.');
}

export function parseMoney(input: string): ParseResult {
  const value = parseDecimal(input, /грн\.?/gi);
  return value !== null && MONEY_PATTERN.test(value)
    ? ok(value)
    : fail('Вкажіть суму числом, до копійок: 6 158,41');
}

export function parseExchangeRate(input: string): ParseResult {
  const value = parseDecimal(input, /%/g);
  return value !== null && EXCHANGE_RATE_PATTERN.test(value)
    ? ok(value)
    : fail('Вкажіть курс числом: 44,9');
}

export function parseText(maxLength: number): (input: string) => ParseResult {
  return (input) => {
    const value = input.trim();
    if (value.length === 0) {
      return fail('Значення не може бути порожнім.');
    }
    return value.length <= maxLength ? ok(value) : fail(`Не більше ${maxLength} символів.`);
  };
}

export interface TemplateField {
  field: string;
  label: string;
}

export function parseTemplate(
  text: string,
  fields: readonly TemplateField[],
): Record<string, string> {
  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labelPattern = fields.map((f) => escapeRegExp(f.label)).join('|');
  const re = new RegExp(`^[ \\t]*(${labelPattern})[ \\t]*:[ \\t]*`, 'gim');
  const matches = [...text.matchAll(re)];

  const result: Record<string, string> = {};
  matches.forEach((match, index) => {
    const field = fields.find((f) => f.label.toLowerCase() === match[1]!.toLowerCase())?.field;
    if (!field) {
      return;
    }
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1]!.index : text.length;
    result[field] = text.slice(start, end).trim();
  });
  return result;
}
