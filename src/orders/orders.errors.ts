export class OrderNumberTakenError extends Error {
  constructor(readonly orderNumber: string) {
    super(`Order ${orderNumber} already exists`);
    this.name = 'OrderNumberTakenError';
  }
}

export class OrderNotFoundError extends Error {
  constructor(readonly orderNumber: string) {
    super(`Order ${orderNumber} not found`);
    this.name = 'OrderNotFoundError';
  }
}
