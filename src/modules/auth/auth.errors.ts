import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../../common/api-error';

export const AuthErrors = {
  invalidCredentials: () =>
    new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Невірний логін або пароль'),
  invalidTelegramLogin: () =>
    new ApiError(
      HttpStatus.UNAUTHORIZED,
      'TELEGRAM_AUTH_INVALID',
      'Не вдалося підтвердити вхід через Telegram',
    ),
  notRegistered: () =>
    new ApiError(
      HttpStatus.FORBIDDEN,
      'NOT_REGISTERED',
      'Спершу надішліть боту /start і дочекайтеся схвалення доступу',
    ),
  accessPending: () =>
    new ApiError(HttpStatus.FORBIDDEN, 'ACCESS_PENDING', 'Заявка на доступ ще розглядається'),
  accessRejected: () =>
    new ApiError(HttpStatus.FORBIDDEN, 'ACCESS_REJECTED', 'Доступ відхилено адміністратором'),
  sessionInvalid: () =>
    new ApiError(HttpStatus.UNAUTHORIZED, 'SESSION_INVALID', 'Сесія недійсна, увійдіть знову'),
  forbidden: () => new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Недостатньо прав для цієї дії'),
  loginTaken: () => new ApiError(HttpStatus.CONFLICT, 'LOGIN_TAKEN', 'Цей логін уже зайнятий'),
  currentPasswordInvalid: () =>
    new ApiError(HttpStatus.BAD_REQUEST, 'CURRENT_PASSWORD_INVALID', 'Поточний пароль невірний'),
};
