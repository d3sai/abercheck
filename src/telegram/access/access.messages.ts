import { type Manager, ManagerStatus } from '../../generated/prisma/client';
import { type BotReply, button } from '../bot-reply';
import { escapeHtml } from '../format';

export const ACCESS_DECISION = /^manager:(approve|reject):(\d+)$/;

export function accessRequest(manager: Manager): BotReply {
  return {
    html: requestText(manager),
    buttons: [
      [
        button('✅ Підтвердити', `manager:approve:${manager.id}`),
        button('❌ Відхилити', `manager:reject:${manager.id}`),
      ],
    ],
  };
}

export function decidedAccessRequest(manager: Manager, adminName: string): string {
  const verdict = manager.status === ManagerStatus.ACTIVE ? '✅ Доступ надано' : '❌ Відхилено';
  return `${requestText(manager)}\n\n${verdict} · ${escapeHtml(adminName)}`;
}

function requestText(manager: Manager): string {
  return [
    '👤 <b>Заявка на доступ менеджера</b>',
    `Ім'я: ${escapeHtml(manager.name)}`,
    `Username: ${manager.username ? `@${escapeHtml(manager.username)}` : '—'}`,
    `Telegram ID: <code>${manager.telegramId}</code>`,
  ].join('\n');
}

export const HELP =
  'Команди:\n/new — створити замовлення\n/list — мої відкриті замовлення (/list all — усі)\n' +
  '/cancel — скасувати створення замовлення\n\n' +
  'Сповіщення про оплати за вашими замовленнями надходитимуть сюди автоматично.';

export function startReply(manager: Manager, isNew: boolean): BotReply {
  if (isNew) {
    return { html: 'Заявку на доступ надіслано адміністраторам. Я напишу, щойно її розглянуть.' };
  }
  switch (manager.status) {
    case ManagerStatus.ACTIVE:
      return { html: `Вітаю, ${escapeHtml(manager.name)}!\n\n${HELP}` };
    case ManagerStatus.PENDING:
      return {
        html: 'Заявка на доступ ще на розгляді. Я напишу, щойно адміністратор її розгляне.',
      };
    case ManagerStatus.REJECTED:
      return { html: 'Доступ не надано. Якщо це помилка, зверніться до адміністратора.' };
  }
}

export function decisionNotice(manager: Manager): string {
  return manager.status === ManagerStatus.ACTIVE
    ? `✅ Доступ надано.\n\n${HELP}`
    : 'Заявку на доступ відхилено. Якщо це помилка, зверніться до адміністратора.';
}

export const NOT_A_MANAGER =
  'Ця дія доступна лише менеджерам. Надішліть /start, щоб подати заявку на доступ.';
