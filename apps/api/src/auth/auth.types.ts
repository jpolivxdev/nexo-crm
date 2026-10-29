import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';

/** Quem está logado. O negócio vem daqui, nunca de parâmetro enviado pelo navegador. */
export interface AuthContext {
  sessionId: string;
  userId: string;
  tenantId: string | null;
  role: Role;
  name: string;
  csrfToken: string;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}
