export class PaymentNotFoundError extends Error {
  constructor(readonly paymentId: number) {
    super(`Payment #${paymentId} not found`);
    this.name = 'PaymentNotFoundError';
  }
}

export class PaymentAlreadyAttachedError extends Error {
  constructor(readonly paymentId: number) {
    super(`Payment #${paymentId} is already attached to an order`);
    this.name = 'PaymentAlreadyAttachedError';
  }
}
