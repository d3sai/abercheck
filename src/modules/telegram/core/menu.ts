import type { ReplyKeyboardMarkup } from 'telegraf/types';

export const MENU_LABEL = {
  NewOrder: '📝 Нове замовлення',
  NewMinus: '➖ Закрити мінус',
  List: '📋 Список',
  Cancel: '❌ Скасувати',
} as const;

export const mainMenuKeyboard: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: MENU_LABEL.NewOrder }, { text: MENU_LABEL.NewMinus }],
    [{ text: MENU_LABEL.List }, { text: MENU_LABEL.Cancel }],
  ],
  resize_keyboard: true,
};
