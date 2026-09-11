import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import type { BotCommand, InlineKeyboardButton } from 'telegraf/types';
import type { EnvironmentVariables } from '../config/env.validation';

/** Надсилання повідомлень поза контекстом діалогу: сповіщення, заявки, рішення адмінів. */
@Injectable()
export class TelegramSender {
  private readonly logger = new Logger(TelegramSender.name);
  readonly adminChatId: number;

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.adminChatId = config.get('TELEGRAM_ADMIN_CHAT_ID', { infer: true });
  }

  /**
   * HTML-повідомлення. Помилку лише логуємо: недоставлене сповіщення не має
   * скасовувати вже записаний платіж чи рішення адміністратора.
   */
  async send(
    chatId: number | bigint,
    html: string,
    buttons?: InlineKeyboardButton[][],
  ): Promise<boolean> {
    try {
      await this.bot.telegram.sendMessage(Number(chatId), html, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send a message to chat ${chatId}`, error);
      return false;
    }
  }

  sendToAdmins(html: string, buttons?: InlineKeyboardButton[][]): Promise<boolean> {
    return this.send(this.adminChatId, html, buttons);
  }

  /** Меню команд в особистих чатах. Не критично для роботи, тому помилку лише логуємо. */
  async registerCommands(commands: BotCommand[]): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands(commands, { scope: { type: 'all_private_chats' } });
    } catch (error) {
      this.logger.warn('Failed to register bot commands', error);
    }
  }
}
