import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/api-error';

export const CabinetErrors = {
  managerNotFound: () =>
    new ApiError(HttpStatus.NOT_FOUND, 'MANAGER_NOT_FOUND', 'Менеджера не знайдено'),
  managerNotActive: () =>
    new ApiError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'MANAGER_NOT_ACTIVE',
      'Замовлення можна призначити лише менеджеру з активним доступом',
    ),
  cannotChangeSelf: () =>
    new ApiError(HttpStatus.CONFLICT, 'CANNOT_CHANGE_SELF', 'Не можна змінювати власний доступ'),
  periodInvalid: () =>
    new ApiError(
      HttpStatus.BAD_REQUEST,
      'PERIOD_INVALID',
      'Некоректний період: початок має бути не пізніше кінця, не довше 366 днів',
    ),
};
