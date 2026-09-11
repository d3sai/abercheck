import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL must be a PostgreSQL connection string',
  })
  DATABASE_URL!: string;

  /** Ключ, з яким сервіс-джерело платежів викликає наш API (заголовок X-API-Key). */
  @IsString()
  @MinLength(32)
  EXTERNAL_API_KEY!: string;

  /** Токен від @BotFather. */
  @Matches(/^\d+:[\w-]{30,}$/, {
    message: 'TELEGRAM_BOT_TOKEN must be a token issued by @BotFather',
  })
  TELEGRAM_BOT_TOKEN!: string;

  /** Чат адміністраторів: невідомі платежі, переплати, заявки менеджерів. Для групи — від'ємний. */
  @Type(() => Number)
  @IsInt()
  TELEGRAM_ADMIN_CHAT_ID!: number;
}

/** Перевіряє env на старті — застосунок не підніметься з неповною конфігурацією. */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(env, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    throw new Error(`Invalid environment configuration:\n- ${details.join('\n- ')}`);
  }

  return env;
}
