import { Body, Controller, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { type PaymentResponse, toPaymentResponse } from './dto/payment.response';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(ApiKeyGuard, ThrottlerGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  async create(
    @Body() dto: CreatePaymentDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaymentResponse> {
    const result = await this.payments.ingest(dto);
    res.status(result.kind === 'duplicate' ? HttpStatus.OK : HttpStatus.CREATED);
    return toPaymentResponse(result);
  }
}
