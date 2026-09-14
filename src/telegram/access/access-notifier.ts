import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ManagerStatus } from '../../generated/prisma/client';
import { type ManagerAccessChanged, ManagerEvents } from '../../managers/manager.events';
import { TelegramSender } from '../telegram-sender';
import { decisionNotice } from './access.messages';

@Injectable()
export class AccessNotifier {
  constructor(private readonly sender: TelegramSender) {}

  @OnEvent(ManagerEvents.AccessChanged, { async: true })
  async onAccessChanged({ manager }: ManagerAccessChanged): Promise<void> {
    if (manager.status !== ManagerStatus.PENDING) {
      await this.sender.send(manager.telegramId, decisionNotice(manager));
    }
  }
}
