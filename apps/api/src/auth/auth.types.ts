import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';

/** Quem está logado. O negócio vem daqui, nunca de parâmetro enviado pelo navegador. */
export interface AuthContext {
  sessionId: string;
  userId: string;
  /** Negócio da sessão. Para admin nexo, só durante uma entrada controlada (com motivo). */
  tenantId: string | null;
  role: Role;
  name: string;
  csrfToken: string;
  /** Senha provisória: só pode trocar a senha até resolver isso. */
  mustChangePassword: boolean;
  /** Entrada controlada do admin nexo num negócio, se houver. */
  acting: { tenantId: string; until: Date } | null;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}
