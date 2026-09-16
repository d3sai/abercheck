import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

const FIRST_RETRY_MS = 5_000;
const MAX_RETRY_MS = 60_000;

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

@Injectable()
export class BotLauncher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BotLauncher.name);
  private stopped = false;
  private retryTimer?: NodeJS.Timeout;

  constructor(@InjectBot() private readonly bot: Telegraf) {}

  onApplicationBootstrap(): void {
    this.bot.catch((error, ctx) => {
      this.logger.error(`Failed to handle update ${ctx.update.update_id}: ${describe(error)}`);
      Sentry.withIsolationScope(() => {
        Sentry.setTag('telegram.update_id', ctx.update.update_id);
        Sentry.captureException(error);
      });
    });
    this.launch(0);
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
  }

  retryDelay(attempt: number): number {
    return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt);
  }

  private launch(attempt: number): void {
    const startedAt = Date.now();
    this.bot
      .launch(() => {
        this.logger.log(`Telegram bot @${this.bot.botInfo?.username ?? ''} connected`);
      })
      .catch((error: unknown) => {
        if (this.stopped) {
          return;
        }
        const next = Date.now() - startedAt > MAX_RETRY_MS ? 0 : attempt;
        const delay = this.retryDelay(next);
        this.logger.error(
          `Telegram polling stopped: ${describe(error)}. Retrying in ${delay / 1000}s`,
        );
        this.retryTimer = setTimeout(() => this.launch(next + 1), delay);
      });
  }
}
