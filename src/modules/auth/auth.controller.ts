import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Manager } from '../../generated/prisma/client';
import { CurrentManager } from './auth.decorators';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { type MeResponse, type SessionResponse, toMeResponse } from './dto/session.response';
import { SetCredentialsDto } from './dto/set-credentials.dto';
import { TelegramLoginDto } from './dto/telegram-login.dto';
import { SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  telegram(@Body() dto: TelegramLoginDto): Promise<SessionResponse> {
    return this.auth.loginWithTelegram(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  login(@Body() dto: LoginDto): Promise<SessionResponse> {
    return this.auth.loginWithPassword(dto);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentManager() manager: Manager): MeResponse {
    return toMeResponse(manager);
  }

  @Put('credentials')
  @UseGuards(SessionGuard)
  setCredentials(
    @CurrentManager() manager: Manager,
    @Body() dto: SetCredentialsDto,
  ): Promise<SessionResponse> {
    return this.auth.setCredentials(manager, dto);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  logoutAll(@CurrentManager() manager: Manager): Promise<void> {
    return this.auth.revokeSessions(manager.id);
  }
}
