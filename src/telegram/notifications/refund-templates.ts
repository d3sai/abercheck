import type { OrderCancelled, RefundRecorded } from '../../refunds/refund.events';
import { escapeHtml, formatMoney } from '../format';
import { statusLabel } from '../status-labels';

export function managerRefundMessage({ refund, order, amountPaid }: RefundRecorded): string {
  return [
    '↩️ <b>Оформлено повернення</b>',
    `Замовлення № <b>${escapeHtml(order.orderNumber)}</b>`,
    `Клієнт: ${escapeHtml(order.clientName)}`,
    `Сума замовлення: ${formatMoney(order.amountDue)} грн`,
    `Повернено: ${formatMoney(refund.amount)} грн`,
    `Сплачено чистими: ${formatMoney(amountPaid)} грн`,
    `Статус: ${statusLabel(order.status)}`,
    `Оформив(ла): ${escapeHtml(refund.initiatedByName)}`,
  ].join('\n');
}

export function managerCancelMessage({ order, initiator }: OrderCancelled): string {
  return [
    '❌ <b>Замовлення скасовано</b>',
    `Замовлення № <b>${escapeHtml(order.orderNumber)}</b>`,
    `Клієнт: ${escapeHtml(order.clientName)}`,
    `Скасував(ла): ${escapeHtml(initiator.name)}`,
  ].join('\n');
}
