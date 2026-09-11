import { Transform } from 'class-transformer';
import { IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_PATTERN } from '../../common/money';
import { Trim } from '../../common/trim.decorator';

/** ISO 8601 з явним часовим поясом — інакше час платежу залежав би від TZ сервера. */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Тіло POST /api/payments — платіж, який сервіс-джерело вже прив'язав до замовлення. */
export class CreatePaymentDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  external_transaction_id!: string;

  /** Номер 1С; null або відсутній, якщо сервіс не зміг визначити замовлення. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(128)
  order_number?: string | null;

  /** Рядок ("3614.32") або число; більше двох знаків після крапки не приймаємо. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value,
  )
  @Matches(MONEY_PATTERN, { message: 'amount must be a positive amount with up to 2 decimals' })
  amount!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  payer_name!: string;

  /** Отримувач коштів: "ФОП Гук В.С", "ТОВ Абертайм" або IBAN. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  receiving_account!: string;

  @IsString()
  @MaxLength(1000)
  purpose_text!: string;

  @Matches(ISO_WITH_OFFSET, { message: 'paid_at must be ISO 8601 with a timezone offset' })
  @IsISO8601({ strict: true })
  paid_at!: string;
}
