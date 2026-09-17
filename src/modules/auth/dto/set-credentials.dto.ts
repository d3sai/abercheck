import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { NormalizeLogin } from './login.dto';

export const LOGIN_PATTERN = /^[a-z0-9._-]{3,32}$/;

export class SetCredentialsDto {
  @NormalizeLogin()
  @Matches(LOGIN_PATTERN, {
    message: 'login must be 3-32 latin letters, digits, dots, dashes or underscores',
  })
  login!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;
}
