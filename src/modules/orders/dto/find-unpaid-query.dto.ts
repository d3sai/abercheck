import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class FindUnpaidQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 200;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  cursor?: number;
}
