import { Injectable } from '@nestjs/common';
import { type Manager, ManagerStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface TelegramProfile {
  telegramId: bigint;
  name: string;
  username: string | null;
}

@Injectable()
export class ManagersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number): Promise<Manager | null> {
    return this.prisma.manager.findUnique({ where: { id } });
  }

  findActiveByTelegramId(telegramId: bigint): Promise<Manager | null> {
    return this.prisma.manager.findFirst({ where: { telegramId, status: ManagerStatus.ACTIVE } });
  }

  async requestAccess(profile: TelegramProfile): Promise<{ manager: Manager; isNew: boolean }> {
    const { telegramId, name, username } = profile;
    const existing = await this.prisma.manager.findUnique({ where: { telegramId } });
    if (existing) {
      const manager = await this.prisma.manager.update({
        where: { id: existing.id },
        data: { name, username },
      });
      return { manager, isNew: false };
    }

    const manager = await this.prisma.manager.create({ data: { telegramId, name, username } });
    return { manager, isNew: true };
  }

  async decide(id: number, approve: boolean): Promise<Manager | null> {
    const { count } = await this.prisma.manager.updateMany({
      where: { id, status: ManagerStatus.PENDING },
      data: { status: approve ? ManagerStatus.ACTIVE : ManagerStatus.REJECTED },
    });
    return count === 0 ? null : this.findById(id);
  }
}
