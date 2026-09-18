const ORDER_NUMBER = /(?<!\d)\d{4}-\d{6}(?!\d)/;

export function normalizeOrderNumber(raw: string): string {
  return ORDER_NUMBER.exec(raw)?.[0] ?? raw.trim();
}

export function generateClosingOrderNumber(): string {
  return `МІНУС-${Date.now()}`;
}
