import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_PATTERN } from '../../../common/money';
import { Trim } from '../../../common/trim.decorator';

export class UpdateOrderDto {
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  clientName?: string;

  @Trim()
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'amountDue must be a positive amount with up to 2 decimals' })
  amountDue?: string;

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
