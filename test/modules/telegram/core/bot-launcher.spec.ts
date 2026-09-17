import type { Telegraf } from 'telegraf';
import { BotLauncher } from '../../../../src/modules/telegram/core/bot-launcher';

describe('BotLauncher', () => {
  const conflict = new Error('409: Conflict: terminated by other getUpdates request');
  let bot: {
    launch: jest.Mock;
    catch: jest.Mock<void, [(error: unknown, ctx: unknown) => void]>;
    botInfo?: { username: string };
  };
  let launcher: BotLauncher;

  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    bot = {
      launch: jest.fn(),
      catch: jest.fn<void, [(error: unknown, ctx: unknown) => void]>(),
      botInfo: { username: 'test_bot' },
    };
    launcher = new BotLauncher(bot as unknown as Telegraf);
  });

  afterEach(() => {
    launcher.onApplicationShutdown();
    jest.useRealTimers();
  });

  it('should keep the app alive and retry when polling fails', async () => {
    bot.launch.mockRejectedValueOnce(conflict).mockReturnValue(new Promise(() => undefined));

    launcher.onApplicationBootstrap();
    await flush();
    expect(bot.launch).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5_000);
    expect(bot.launch).toHaveBeenCalledTimes(2);
  });

  it('should back off up to one minute between attempts', () => {
    expect([0, 1, 2, 3, 4, 5].map((attempt) => launcher.retryDelay(attempt))).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000,
    ]);
  });

  it('should grow the pause while the conflict persists', async () => {
    bot.launch.mockRejectedValue(conflict);

    launcher.onApplicationBootstrap();
    await flush();
    jest.advanceTimersByTime(5_000);
    await flush();
    jest.advanceTimersByTime(9_999);
    expect(bot.launch).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(1);
    expect(bot.launch).toHaveBeenCalledTimes(3);
  });

  it('should stop retrying after shutdown', async () => {
    bot.launch.mockRejectedValue(conflict);

    launcher.onApplicationBootstrap();
    launcher.onApplicationShutdown();
    await flush();
    jest.advanceTimersByTime(120_000);

    expect(bot.launch).toHaveBeenCalledTimes(1);
  });

  it('should log handler errors instead of crashing the bot', () => {
    bot.launch.mockReturnValue(new Promise(() => undefined));
    launcher.onApplicationBootstrap();

    const [handler] = bot.catch.mock.calls[0]!;

    expect(() => handler(new Error('db down'), { update: { update_id: 7 } })).not.toThrow();
  });
});
