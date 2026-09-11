import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Action, Command, Ctx, Help, On, Start, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import type { Manager } from '../generated/prisma/client';
import { ManagersService } from '../managers/managers.service';
import {
  ACCESS_DECISION,
  accessRequest,
  decidedAccessRequest,
  decisionNotice,
  HELP,
  NOT_A_MANAGER,
  startReply,
} from './access/access.messages';
import type { BotReply } from './bot-reply';
import { DraftAction, OrderDraftService } from './order-draft/order-draft.service';
import { TelegramSender } from './telegram-sender';

type MatchContext = Context & { match: RegExpExecArray };

async function reply(ctx: Context, { html, buttons }: BotReply): Promise<void> {
  await ctx.reply(html, {
    parse_mode: 'HTML',
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

const isPrivate = (ctx: Context) => ctx.chat?.type === 'private';
const fullName = (ctx: Context) =>
  [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'Без імені';

/**
 * Усі обробники бота. Порядок методів важливий: nestjs-telegraf реєструє їх саме так,
 * тож команди стоять перед загальним обробником тексту. Методи нічого не повертають —
 * інакше бібліотека відправить результат як повідомлення.
 */
@Update()
export class BotUpdate implements OnApplicationBootstrap {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    private readonly managers: ManagersService,
    private readonly drafts: OrderDraftService,
    private readonly sender: TelegramSender,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sender.registerCommands([
      { command: 'new', description: 'Створити замовлення' },
      { command: 'cancel', description: 'Скасувати створення замовлення' },
      { command: 'help', description: 'Що вміє бот' },
    ]);
  }

  @Start()
  async start(@Ctx() ctx: Context): Promise<void> {
    if (!isPrivate(ctx) || !ctx.from) {
      return;
    }
    const { manager, isNew } = await this.managers.requestAccess({
      telegramId: BigInt(ctx.from.id),
      name: fullName(ctx),
      username: ctx.from.username ?? null,
    });
    if (isNew) {
      const request = accessRequest(manager);
      await this.sender.sendToAdmins(request.html, request.buttons);
    }
    await reply(ctx, startReply(manager, isNew));
  }

  @Help()
  async help(@Ctx() ctx: Context): Promise<void> {
    if (isPrivate(ctx)) {
      await reply(ctx, { html: HELP });
    }
  }

  @Command('new')
  async newOrder(@Ctx() ctx: Context): Promise<void> {
    if (await this.activeManager(ctx)) {
      await reply(ctx, this.drafts.start(BigInt(ctx.from!.id)));
    }
  }

  @Command('cancel')
  async cancel(@Ctx() ctx: Context): Promise<void> {
    if (isPrivate(ctx) && ctx.from) {
      await reply(ctx, this.drafts.cancel(BigInt(ctx.from.id)));
    }
  }

  /** Службова: ID поточного чату — щоб налаштувати TELEGRAM_ADMIN_CHAT_ID. */
  @Command('chatid')
  async chatId(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat) {
      await reply(ctx, { html: `ID цього чату: <code>${ctx.chat.id}</code>` });
    }
  }

  /** Кнопки заявки. Рішення приймаються лише в адмінському чаті. */
  @Action(ACCESS_DECISION)
  async decideAccess(@Ctx() ctx: MatchContext): Promise<void> {
    if (ctx.chat?.id !== this.sender.adminChatId) {
      await ctx.answerCbQuery('Заявки розглядають в адмінському чаті.');
      return;
    }
    const [, action, id] = ctx.match;
    const manager = await this.managers.decide(Number(id), action === 'approve');
    if (!manager) {
      await ctx.answerCbQuery('Заявку вже розглянуто.');
      return;
    }

    await ctx.editMessageText(decidedAccessRequest(manager, fullName(ctx)), { parse_mode: 'HTML' });
    await ctx.answerCbQuery(action === 'approve' ? 'Доступ надано' : 'Заявку відхилено');
    await this.sender.send(manager.telegramId, decisionNotice(manager));
    this.logger.log(`Manager #${manager.id} ${manager.status} by ${ctx.from?.id}`);
  }

  @Action(DraftAction.Skip)
  async skipStep(@Ctx() ctx: Context): Promise<void> {
    const next = ctx.from ? this.drafts.skip(BigInt(ctx.from.id)) : null;
    await this.answerDraftButton(ctx, next, "Цей крок обов'язковий.");
  }

  @Action(DraftAction.Confirm)
  async confirmOrder(@Ctx() ctx: Context): Promise<void> {
    const manager = await this.activeManager(ctx);
    const result = manager ? await this.drafts.confirm(manager.telegramId, manager.id) : null;
    await this.answerDraftButton(ctx, result, 'Немає замовлення для підтвердження.');
  }

  @Action(DraftAction.Cancel)
  async cancelDraft(@Ctx() ctx: Context): Promise<void> {
    const result = ctx.from ? this.drafts.cancel(BigInt(ctx.from.id)) : null;
    await this.answerDraftButton(ctx, result, '');
  }

  /** Текст у особистому чаті — це відповідь на поточний крок створення замовлення. */
  @On('text')
  async text(@Ctx() ctx: Context): Promise<void> {
    if (!isPrivate(ctx) || !ctx.from || !ctx.text) {
      return;
    }
    if (ctx.text.startsWith('/')) {
      await reply(ctx, { html: `Невідома команда.\n\n${HELP}` });
      return;
    }
    const userId = BigInt(ctx.from.id);
    if (!this.drafts.hasDraft(userId)) {
      await reply(ctx, { html: HELP });
      return;
    }
    if (!(await this.activeManager(ctx))) {
      this.drafts.cancel(userId);
      return;
    }
    const next = await this.drafts.input(userId, ctx.text);
    if (next) {
      await reply(ctx, next);
    }
  }

  /** Прибирає кнопки з натиснутого повідомлення, щоб старий крок не можна було натиснути ще раз. */
  private async answerDraftButton(
    ctx: Context,
    result: BotReply | null,
    notice: string,
  ): Promise<void> {
    await ctx.answerCbQuery(result ? undefined : notice || undefined);
    if (!result) {
      return;
    }
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await reply(ctx, result);
  }

  /** Активний менеджер в особистому чаті; інакше пояснює, чому дію не виконано. */
  private async activeManager(ctx: Context): Promise<Manager | null> {
    if (!isPrivate(ctx) || !ctx.from) {
      return null;
    }
    const manager = await this.managers.findActiveByTelegramId(BigInt(ctx.from.id));
    if (!manager) {
      await reply(ctx, { html: NOT_A_MANAGER });
    }
    return manager;
  }
}
