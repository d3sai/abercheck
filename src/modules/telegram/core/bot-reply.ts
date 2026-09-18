import type { InlineKeyboardButton } from 'telegraf/types';

export interface BotReply {
  html: string;
  buttons?: InlineKeyboardButton[][];
  forceReply?: { placeholder: string };
  /** Attach the persistent main-menu keyboard to this message. */
  menu?: boolean;
}

export const button = (text: string, callbackData: string): InlineKeyboardButton => ({
  text,
  callback_data: callbackData,
});

export const mention = (userId: number | bigint, htmlName: string): string =>
  `<a href="tg://user?id=${userId}">${htmlName}</a>`;
