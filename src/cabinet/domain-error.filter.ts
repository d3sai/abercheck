import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from '../common/api-error';
import {
  OrderCancelledError,
  OrderNotFoundError,
  OrderNumberTakenError,
} from '../orders/orders.errors';
import { PaymentAlreadyAttachedError, PaymentNotFoundError } from '../payments/payments.errors';
import {
  NothingToRefundError,
  OrderHasPaymentsError,
  RefundAmountError,
} from '../refunds/refunds.errors';
import { formatMoney } from '../telegram/format';

type DomainError =
  | OrderNotFoundError
  | OrderNumberTakenError
  | OrderCancelledError
  | PaymentNotFoundError
  | PaymentAlreadyAttachedError
  | RefundAmountError
  | NothingToRefundError
  | OrderHasPaymentsError;

export function toApiError(error: DomainError): ApiError {
  if (error instanceof OrderNotFoundError) {
    return new ApiError(
      HttpStatus.NOT_FOUND,
      'ORDER_NOT_FOUND',
      `Замовлення № ${error.orderNumber} не знайдено`,
    );
  }
  if (error instanceof OrderNumberTakenError) {
    return new ApiError(
      HttpStatus.CONFLICT,
      'ORDER_NUMBER_TAKEN',
      `Замовлення № ${error.orderNumber} уже існує`,
    );
  }
  if (error instanceof OrderCancelledError) {
    return new ApiError(
      HttpStatus.CONFLICT,
      'ORDER_CANCELLED',
      `Замовлення № ${error.orderNumber} скасоване`,
    );
  }
  if (error instanceof PaymentNotFoundError) {
    return new ApiError(
      HttpStatus.NOT_FOUND,
      'PAYMENT_NOT_FOUND',
      `Платіж #${error.paymentId} не знайдено`,
    );
  }
  if (error instanceof PaymentAlreadyAttachedError) {
    return new ApiError(
      HttpStatus.CONFLICT,
      'PAYMENT_ALREADY_ATTACHED',
      `Платіж #${error.paymentId} уже прив'язано до замовлення`,
    );
  }
  if (error instanceof RefundAmountError) {
    return new ApiError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'REFUND_AMOUNT_INVALID',
      `Повернути можна від 0,01 до ${formatMoney(error.available)} грн`,
    );
  }
  if (error instanceof NothingToRefundError) {
    return new ApiError(
      HttpStatus.CONFLICT,
      'NOTHING_TO_REFUND',
      `За замовленням № ${error.orderNumber} повертати нічого`,
    );
  }
  return new ApiError(
    HttpStatus.CONFLICT,
    'ORDER_HAS_PAYMENTS',
    `За замовленням № ${error.orderNumber} сплачено ${formatMoney(error.paid)} грн — спершу оформіть повернення`,
  );
}

@Catch(
  OrderNotFoundError,
  OrderNumberTakenError,
  OrderCancelledError,
  PaymentNotFoundError,
  PaymentAlreadyAttachedError,
  RefundAmountError,
  NothingToRefundError,
  OrderHasPaymentsError,
)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  catch(error: DomainError, host: ArgumentsHost): void {
    const apiError = toApiError(error);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(apiError.getStatus())
      .json(apiError.getResponse());
  }
}
