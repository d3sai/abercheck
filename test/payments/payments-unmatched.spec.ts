import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../src/generated/prisma/client';
import { PaymentsService } from '../../src/payments/payments.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PaymentsService.findUnmatchedPage', () => {
  const payment = { findMany: jest.fn(), count: jest.fn() };
  let service: PaymentsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: { payment } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
    payment.findMany.mockResolvedValue([]);
    payment.count.mockResolvedValue(0);
  });

  afterEach(() => jest.resetAllMocks());

  it('should page through unattached payments, newest first', async () => {
    await service.findUnmatchedPage({ skip: 20, take: 10 });

    expect(payment.findMany).toHaveBeenCalledWith({
      where: { orderId: null },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 10,
    });
    expect(payment.count).toHaveBeenCalledWith({ where: { orderId: null } });
  });

  it('should search by payer, purpose and reported order number', async () => {
    await service.findUnmatchedPage({ text: 'Сидоренко', skip: 0, take: 10 });

    expect(payment.count).toHaveBeenCalledWith({
      where: {
        orderId: null,
        OR: [
          { payerName: { contains: 'Сидоренко', mode: 'insensitive' } },
          { purposeText: { contains: 'Сидоренко', mode: 'insensitive' } },
          { reportedOrderNumber: { contains: 'Сидоренко' } },
        ],
      },
    });
  });

  it('should also match the exact amount when the query looks like money', async () => {
    await service.findUnmatchedPage({ text: '2544,09', skip: 0, take: 10 });

    const [{ where }] = payment.count.mock.calls[0] as [{ where: { OR: object[] } }];
    expect(where.OR).toContainEqual({ amount: new Prisma.Decimal('2544.09') });
  });
});
