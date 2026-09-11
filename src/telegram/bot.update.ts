import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Action, Command, Ctx, Help, Next, On, Start, Update } from 'nestjs-telegraf';
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
import { ADMIN_HELP } from './admin/admin.update';
import type { BotReply } from './bot-reply';
import { OrderListService } from './order-list.service';
import { DraftAction, OrderDraftService } from './order-draft/order-draft.service';
import {
  type CommandContext,
  fullName,
  isPrivate,
  type MatchContext,
  reply,
} from './telegram-context';
import { TelegramSender } from './telegram-sender';

type Next = () => Promise<void>;

@Update()
export class BotUpdate implements OnApplicationBootstrap {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    private readonly managers: ManagersService,
    private readonly drafts: OrderDraftService,
    private readonly lists: OrderListService,
    private readonly sender: TelegramSender,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sender.registerCommands(
      [
        { command: 'new', description: 'Створити замовлення' },
        { command: 'list', description: 'Мої відкриті замовлення' },
        { command: 'cancel', description: 'Скасувати створення замовлення' },
        { command: 'help', description: 'Що вміє бот' },
      ],
      { type: 'all_private_chats' },
    );
    await this.sender.registerCommands(
      [
        { command: 'list', description: 'Відкриті замовлення й невідомі платежі' },
        { command: 'refund', description: 'Повернення або скасування: /refund 0000-066717' },
        { command: 'attach', description: "Прив'язати платіж: /attach 15 0000-066717" },
        { command: 'help', description: 'Команди адміністратора' },
      ],
      { type: 'chat', chat_id: this.sender.adminChatId },
    );
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
    if (ctx.chat?.id === this.sender.adminChatId) {
      await reply(ctx, { html: ADMIN_HELP });
    } else if (isPrivate(ctx)) {
      await reply(ctx, { html: HELP });
    }
  }

  @Command('chatid')
  async chatId(@Ctx() ctx: Context): Promise<void> {
    if (ctx.chat) {
      await reply(ctx, { html: `ID цього чату: <code>${ctx.chat.id}</code>` });
    }
  }

  @Command('list')
  async list(@Ctx() ctx: CommandContext): Promise<void> {
    const all = ctx.payload?.trim().toLowerCase() === 'all';
    if (ctx.chat?.id === this.sender.adminChatId) {
      await reply(ctx, await this.lists.forAdmins(all));
      return;
    }
    const manager = await this.activeManager(ctx);
    if (manager) {
      await reply(ctx, await this.lists.forManager(manager.id, all));
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

  @On('text')
  async text(@Ctx() ctx: Context, @Next() next: Next): Promise<void> {
    if (!isPrivate(ctx) || !ctx.from || !ctx.text || ctx.text.startsWith('/')) {
      return next();
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
    const answer = await this.drafts.input(userId, ctx.text);
    if (answer) {
      await reply(ctx, answer);
    }
  }

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
