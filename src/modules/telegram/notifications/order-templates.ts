import type { Manager, Order, Prisma } from '../../../generated/prisma/client';
import { escapeHtml, formatKyivDateTime, formatMoney } from '../core/format';

function formatRate(value: Prisma.Decimal): string {
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

export function adminOrderCreatedMessage(order: Order, manager: Manager): string {
  return [
    '🆕 <b>Нове замовлення</b>',
    `№ <b>${escapeHtml(order.orderNumber)}</b>`,
    `Клієнт: ${escapeHtml(order.clientName)}`,
    `Сума: ${formatMoney(order.amountDue)} грн`,
    ...(order.exchangeRate ? [`Курс: ${formatRate(order.exchangeRate)}`] : []),
    ...(order.clientPhone ? [`Телефон: ${escapeHtml(order.clientPhone)}`] : []),
    '',
    `Менеджер: ${escapeHtml(manager.name)}`,
    `Створено: ${formatKyivDateTime(order.createdAt)}`,
  ].join('\n');
}
