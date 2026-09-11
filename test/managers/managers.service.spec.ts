import { Test } from '@nestjs/testing';
import { ManagerStatus } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagersService } from '../../src/managers/managers.service';

describe('ManagersService', () => {
  const manager = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const profile = { telegramId: 5000000000n, name: 'Христина', username: 'khrystyna' };
  let service: ManagersService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ManagersService, { provide: PrismaService, useValue: { manager } }],
    }).compile();

    service = moduleRef.get(ManagersService);
  });

  afterEach(() => jest.resetAllMocks());

  describe('requestAccess', () => {
    it('should create a pending request for a new user', async () => {
      manager.findUnique.mockResolvedValue(null);
      manager.create.mockResolvedValue({ id: 1, status: ManagerStatus.PENDING });

      await expect(service.requestAccess(profile)).resolves.toMatchObject({ isNew: true });
      expect(manager.create).toHaveBeenCalledWith({ data: profile });
    });

    it('should only refresh the name of a known user without touching the status', async () => {
      manager.findUnique.mockResolvedValue({ id: 1, status: ManagerStatus.REJECTED });
      manager.update.mockResolvedValue({ id: 1, status: ManagerStatus.REJECTED });

      await expect(service.requestAccess(profile)).resolves.toMatchObject({ isNew: false });
      expect(manager.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'Христина', username: 'khrystyna' },
      });
      expect(manager.create).not.toHaveBeenCalled();
    });
  });

  describe('decide', () => {
    it('should activate a pending request', async () => {
      manager.updateMany.mockResolvedValue({ count: 1 });
      manager.findUnique.mockResolvedValue({ id: 1, status: ManagerStatus.ACTIVE });

      await expect(service.decide(1, true)).resolves.toMatchObject({ status: 'ACTIVE' });
      expect(manager.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: ManagerStatus.PENDING },
        data: { status: ManagerStatus.ACTIVE },
      });
    });

    it('should return null when the request was already decided', async () => {
      manager.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.decide(1, false)).resolves.toBeNull();
      expect(manager.findUnique).not.toHaveBeenCalled();
    });
  });

  it('should find only active managers by Telegram id', async () => {
    await service.findActiveByTelegramId(5000000000n);

    expect(manager.findFirst).toHaveBeenCalledWith({
      where: { telegramId: 5000000000n, status: ManagerStatus.ACTIVE },
    });
  });
});
