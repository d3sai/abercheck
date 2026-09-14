import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { EnvironmentVariables } from '../config/env.validation';
import { AuthController } from './auth.controller';
import { AuthService, JWT_AUDIENCE, JWT_ISSUER, SESSION_TTL_SECONDS } from './auth.service';
import { LOGIN_THROTTLERS } from './login-throttle';
import { SessionGuard } from './session.guard';
import { TelegramLoginVerifier } from './telegram-login.verifier';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): JwtModuleOptions => ({
        secret: config.get('WEB_JWT_SECRET', { infer: true }),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: SESSION_TTL_SECONDS,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      }),
    }),
    ThrottlerModule.forRoot({ throttlers: LOGIN_THROTTLERS }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TelegramLoginVerifier, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
