import { HttpException, type HttpStatus } from '@nestjs/common';

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

export class ApiError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ statusCode: status, code, message } satisfies ApiErrorBody, status);
  }
}
