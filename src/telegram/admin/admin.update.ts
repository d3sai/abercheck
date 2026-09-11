import { Action, Command, Ctx, Next, On, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import type { BotReply } from '../bot-reply';
import { type CommandContext, edit, fullName, type MatchContext, reply } from '../telegram-context';
import { TelegramSender } from '../telegram-sender';
import { type Admin, AdminAction, AdminFlowService } from './admin-flow.service';

export const ADMIN_HELP =
  'Команди адміністратора:\n' +
  '/list — відкриті замовлення й невідомі платежі (/list all — усі)\n' +
  '/refund 0000-066717 — повернення або скасування\n' +
  "/attach 15 0000-066717 — прив'язати платіж #15 до замовлення\n\n" +
  "Під кожним невідомим платежем є кнопка «Прив'язати до замовлення».";

type Next = () => Promise<void>;

@Update()
export class AdminUpdate {
  constructor(
    private readonly flow: AdminFlowService,
    private readonly sender: TelegramSender,
  ) {}

  @Command('refund')
  async refund(@Ctx() ctx: CommandContext, @Next() next: Next): Promise<void> {
    if (!this.isAdminChat(ctx)) return next();
    await reply(ctx, await this.flow.refundMenu(ctx.payload ?? ''));
  }

  @Command('attach')
  async attach(@Ctx() ctx: CommandContext, @Next() next: Next): Promise<void> {
    if (!this.isAdminChat(ctx)) return next();
    const match = /^#?(\d+)\s+(.+)$/.exec((ctx.payload ?? '').trim());
    await reply(
      ctx,
      match
        ? await this.flow.attachPreview(Number(match[1]), match[2]!)
        : {
            html: 'Формат: <code>/attach 15 0000-066717</code> — номер платежу і номер замовлення.',
          },
    );
  }

  @Action(AdminAction.AttachStart)
  async attachStart(@Ctx() ctx: MatchContext): Promise<void> {
    if (!(await this.ensureAdminChat(ctx))) return;
    await ctx.answerCbQuery();
    const prompt = await this.flow.attachPrompt(Number(ctx.match[1]), this.admin(ctx));
    await reply(ctx, prompt, ctx.callbackQuery?.message?.message_id);
  }

  @Action(AdminAction.AttachConfirm)
  async attachConfirm(@Ctx() ctx: MatchContext): Promise<void> {
    if (!(await this.ensureAdminChat(ctx))) return;
    await this.finish(
      ctx,
      await this.flow.attach(Number(ctx.match[1]), ctx.match[2]!, this.admin(ctx)),
    );
  }

  @Action(AdminAction.RefundAsk)
  async refundAsk(@Ctx() ctx: MatchContext): Promise<void> {
    if (!(await this.ensureAdminChat(ctx))) return;
    await this.finish(ctx, await this.flow.refundConfirm(Number(ctx.match[1]), ctx.match[2]!));
  }

  @Action(AdminAction.RefundPartial)
  async refundPartial(@Ctx() ctx: MatchContext): Promise<void> {
    if (!(await this.ensureAdminChat(ctx))) return;
    await ctx.answerCbQuery();
    await reply(ctx, await this.flow.refundPrompt(Number(ctx.match[1]), this.admin(ctx)));
  }

  @Action(AdminAction.RefundConfirm)
  async refundConfirm(@Ctx() ctx: MatchContext): Promise<void> {
    if (!(await this.ensureAdminChat(ctx))) return;
    await this.finish(
      ctx,
      await this.flow.refund(Number(ctx.match[1]), ctx.match[2]!, this.admin(ctx)),
    );
  }

  @Action(AdminAction.CancelAsk)
  async cancelAsk(@Ctx() ctx: MatchContext): Promise<void> {
    if (!(await this.ensureAdminChat(ctx))) return;
    await this.finish(ctx, await this.flow.cancelConfirm(Number(ctx.match[1])));
  }

  @Action(AdminAction.CancelConfirm)
  async cancelConfirm(@Ctx() ctx: MatchContext): Promise<void> {
    if (!(await this.ensureAdminChat(ctx))) return;
    await this.finish(ctx, await this.flow.cancel(Number(ctx.match[1]), this.admin(ctx)));
  }

  @Action(AdminAction.Dismiss)
  async dismiss(@Ctx() ctx: Context): Promise<void> {
    if (!(await this.ensureAdminChat(ctx))) return;
    await ctx.answerCbQuery();
    await edit(ctx, { html: `Скасовано · ${fullName(ctx)}` });
  }

  @On('text')
  async answer(@Ctx() ctx: Context, @Next() next: Next): Promise<void> {
    const message = ctx.message;
    const prompt = message && 'reply_to_message' in message ? message.reply_to_message : undefined;
    if (
      !this.isAdminChat(ctx) ||
      !ctx.text ||
      ctx.text.startsWith('/') ||
      prompt?.from?.id !== ctx.botInfo.id
    ) {
      return next();
    }
    const promptText = prompt && 'text' in prompt ? prompt.text : '';
    const result =
      (await this.flow.answerAttachPrompt(promptText, ctx.text)) ??
      (await this.flow.answerRefundPrompt(promptText, ctx.text));
    if (result) {
      await reply(ctx, result, message?.message_id);
    }
  }

  private async finish(ctx: Context, result: BotReply): Promise<void> {
    if (result.html.startsWith('⚠️')) {
      await ctx.answerCbQuery(result.html.replace(/<[^>]+>/g, '').slice(0, 200), {
        show_alert: true,
      });
      return;
    }
    await ctx.answerCbQuery();
    await edit(ctx, result);
  }

  private admin(ctx: Context): Admin {
    return { userId: ctx.from!.id, telegramId: BigInt(ctx.from!.id), name: fullName(ctx) };
  }

  private isAdminChat(ctx: Context): boolean {
    return ctx.chat?.id === this.sender.adminChatId && ctx.from !== undefined;
  }

  private async ensureAdminChat(ctx: Context): Promise<boolean> {
    if (this.isAdminChat(ctx)) {
      return true;
    }
    await ctx.answerCbQuery('Ця дія доступна лише в адмінському чаті.');
    return false;
  }
}
