import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const NormalizeLogin = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export class LoginDto {
  @NormalizeLogin()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  login!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
