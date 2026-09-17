import { type Manager, type Order, Prisma } from '../../../../src/generated/prisma/client';
import { adminOrderCreatedMessage } from '../../../../src/modules/telegram/notifications/order-templates';

const d = (value: string) => new Prisma.Decimal(value);

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 1,
  orderNumber: '0000-067968',
  clientName: 'ФОП Берчатова Лариса',
  clientPhone: null,
  amountDue: d('170.10'),
  exchangeRate: null,
  invoiceNumber: null,
  requisites: null,
  comment: null,
  status: 'AWAITING_PAYMENT',
  managerId: 7,
  createdAt: new Date('2026-09-12T09:57:00Z'),
  updatedAt: new Date('2026-09-12T09:57:00Z'),
  ...overrides,
});

const manager: Manager = {
  id: 7,
  telegramId: 5000000000n,
  name: 'Христина',
  username: 'khrystyna',
  status: 'ACTIVE',
  role: 'MANAGER',
  login: null,
  passwordHash: null,
  sessionVersion: 0,
  createdAt: new Date(),
};

describe('adminOrderCreatedMessage', () => {
  it('should show the essentials for a bare order', () => {
    const message = adminOrderCreatedMessage(order(), manager);

    expect(message).toBe(
      [
        '🆕 <b>Нове замовлення</b>',
        '№ <b>0000-067968</b>',
        'Клієнт: ФОП Берчатова Лариса',
        'Сума: 170,10 грн',
        '',
        'Менеджер: Христина',
        'Створено: 12:57 12.09.2026',
      ].join('\n'),
    );
  });

  it('should add the rate without trailing zeros and the phone when present', () => {
    const message = adminOrderCreatedMessage(
      order({ exchangeRate: d('44.9000'), clientPhone: '+380501234567' }),
      manager,
    );

    expect(message).toContain('Курс: 44,9\n');
    expect(message).toContain('Телефон: +380501234567\n');
  });

  it('should show a whole-number rate without a decimal part', () => {
    const message = adminOrderCreatedMessage(order({ exchangeRate: d('45.0000') }), manager);

    expect(message).toContain('Курс: 45\n');
  });

  it('should escape HTML in the client name and phone', () => {
    const message = adminOrderCreatedMessage(
      order({ clientName: '<b>Клієнт</b>', clientPhone: '<script>' }),
      manager,
    );

    expect(message).toContain('Клієнт: &lt;b&gt;Клієнт&lt;/b&gt;');
    expect(message).toContain('Телефон: &lt;script&gt;');
  });
});
