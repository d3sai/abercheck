import type { InlineKeyboardButton } from 'telegraf/types';

/** Відповідь бота, не прив'язана до Telegraf-контексту — так логіку діалогів легко тестувати. */
export interface BotReply {
  html: string;
  buttons?: InlineKeyboardButton[][];
}

export const button = (text: string, callbackData: string): InlineKeyboardButton => ({
  text,
  callback_data: callbackData,
});
