import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  // /api/v1/... — зміни контракту для сервісу-джерела підуть у нову версію, не ламаючи v1.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // Невідомі поля мовчки відкидаються: нове поле від сервісу-джерела не має ламати інтеграцію.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
