import type { Manager, ManagerRole } from '../../generated/prisma/client';

export interface MeResponse {
  id: number;
  name: string;
  username: string | null;
  telegramId: string;
  role: ManagerRole;
  login: string | null;
  hasPassword: boolean;
}

export interface SessionResponse {
  token: string;
  expiresAt: string;
  manager: MeResponse;
}

export function toMeResponse(manager: Manager): MeResponse {
  return {
    id: manager.id,
    name: manager.name,
    username: manager.username,
    telegramId: manager.telegramId.toString(),
    role: manager.role,
    login: manager.login,
    hasPassword: manager.passwordHash !== null,
  };
}
