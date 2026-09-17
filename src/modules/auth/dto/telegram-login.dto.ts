import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';

export class TelegramLoginDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  id!: number;

  @IsString()
  @MaxLength(255)
  first_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  photo_url?: string;

  @Type(() => Number)
  @IsInt()
  auth_date!: number;

  @Matches(/^[a-f0-9]{64}$/, { message: 'hash must be a hex SHA-256 digest' })
  hash!: string;
}
