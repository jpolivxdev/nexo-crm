import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { AI_PROVIDER, AiProviderError, type AiProvider, type AiTurn } from './ai-provider.js';
import { NEX_SYSTEM } from './manual.js';

const FEATURE = 'nex';

/**
 * Tira do texto o que pode ser dado pessoal antes de mandar para fora: e-mails e sequências de
 * 8 ou mais dígitos (telefone, CPF). O guia não precisa disso para explicar o caminho.
 */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]')
    .replace(/\(?\+?\d(?:[\s().-]*\d){7,}/g, '[número]')
    .trim();
}

function startOfDayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Nex com pergunta livre. Só manda a pergunta (sem nome, telefone ou e-mail) e o manual das telas;
 * nunca dado do negócio. Limite diário por negócio e registro de uso sem o texto.
 */
@Injectable()
export class AssistantService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider | null,
    @Inject(ENV) private readonly env: Pick<Env, 'NEX_DAILY_LIMIT'>,
  ) {}

  /** O painel mostra a caixa de pergunta só quando tem provedor configurado. */
  async status(tenantId: string) {
    if (!this.provider) return { enabled: false, left: 0 };
    const used = await this.usedToday(tenantId);
    return { enabled: true, left: Math.max(0, this.env.NEX_DAILY_LIMIT - used) };
  }

  private usedToday(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.aiUsage.count({
        where: { feature: FEATURE, outcome: 'ok', createdAt: { gte: startOfDayUtc() } },
      }),
    );
  }

  private record(tenantId: string, outcome: string, input = 0, output = 0) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.aiUsage.create({
        data: {
          tenantId,
          feature: FEATURE,
          provider: this.provider?.name ?? 'nenhum',
          model: this.provider?.model ?? '',
          inputTokens: input,
          outputTokens: output,
          outcome,
        },
      }),
    );
  }

  async ask(tenantId: string, question: string, history: AiTurn[]) {
    if (!this.provider) {
      throw new ServiceUnavailableException(
        'As perguntas livres ainda não estão ligadas. Use os atalhos abaixo ou abra um chamado.',
      );
    }
    if ((await this.usedToday(tenantId)) >= this.env.NEX_DAILY_LIMIT) {
      await this.record(tenantId, 'limit');
      throw new HttpException(
        'Você chegou ao limite de perguntas de hoje. Amanhã libera de novo; até lá, use os atalhos ou abra um chamado.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const turns: AiTurn[] = [
      ...history.slice(-4).map((t) => ({ role: t.role, text: scrub(t.text) })),
      { role: 'user', text: scrub(question) },
    ];
    try {
      const result = await this.provider.generate({ system: NEX_SYSTEM, turns });
      await this.record(tenantId, 'ok', result.inputTokens, result.outputTokens);
      const left = Math.max(0, this.env.NEX_DAILY_LIMIT - (await this.usedToday(tenantId)));
      return { answer: result.text.replace(/[*#`]/g, '').trim(), left };
    } catch (err) {
      if (!(err instanceof AiProviderError)) throw err;
      await this.record(tenantId, err.kind === 'limit' ? 'provider_limit' : 'error');
      throw new ServiceUnavailableException(
        'O Nex não conseguiu responder agora. Tente de novo em alguns minutos ou use os atalhos.',
      );
    }
  }
}
