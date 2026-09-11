import { Injectable } from '@nestjs/common';
import type { Manager } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ManagersService {
  constructor(private readonly prisma: PrismaService) {}

  findByTelegramId(telegramId: bigint): Promise<Manager | null> {
    return this.prisma.manager.findUnique({ where: { telegramId } });
  }

  /** Реєструє менеджера при першому зверненні до бота або оновлює його ім'я. */
  register(telegramId: bigint, name: string): Promise<Manager> {
    return this.prisma.manager.upsert({
      where: { telegramId },
      create: { telegramId, name },
      update: { name },
    });
  }
}
