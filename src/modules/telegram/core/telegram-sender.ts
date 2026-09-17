import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import type { BotCommand, BotCommandScope, InlineKeyboardButton } from 'telegraf/types';
import type { EnvironmentVariables } from '../../../common/config/env.validation';

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

  async registerCommands(commands: BotCommand[], scope: BotCommandScope): Promise<void> {
    try {
      await this.bot.telegram.setMyCommands(commands, { scope });
    } catch (error) {
      this.logger.warn(`Failed to register bot commands for ${scope.type}`, error);
    }
  }
}
