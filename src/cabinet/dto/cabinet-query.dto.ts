import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OrderStatus } from '../../generated/prisma/client';
import type { OrderSort } from '../../orders/orders.service';

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const OptionalText = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  );

export class PageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export const paging = ({ page, pageSize }: PageQueryDto) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

export class SearchPageQueryDto extends PageQueryDto {
  @OptionalText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export const ORDER_SORTS: OrderSort[] = ['createdAt', 'amountDue', 'orderNumber'];

export class OrdersQueryDto extends SearchPageQueryDto {
  @Transform(({ value }: { value: unknown }) => {
    const list = typeof value === 'string' ? value.split(',').filter(Boolean) : value;
    return Array.isArray(list) && list.length === 0 ? undefined : list;
  })
  @IsOptional()
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  managerId?: number;

  @IsIn(ORDER_SORTS)
  sort: OrderSort = 'createdAt';

  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc' = 'desc';
}

export class PeriodQueryDto {
  @Matches(ISO_DATE, { message: 'from must be a date in YYYY-MM-DD format' })
  from!: string;

  @Matches(ISO_DATE, { message: 'to must be a date in YYYY-MM-DD format' })
  to!: string;
}

export class LimitQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
