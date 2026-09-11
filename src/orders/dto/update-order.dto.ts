import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/trim.decorator';

export class UpdateOrderDto {
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  clientName?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  clientPhone?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requisites?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
