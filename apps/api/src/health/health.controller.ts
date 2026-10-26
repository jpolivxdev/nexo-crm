import { Controller, Get, HttpCode, HttpException, HttpStatus, Inject } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../database/database.module.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.pool.query('SELECT 1');
    } catch {
      // Resposta genérica: o detalhe do erro fica só no log interno.
      throw new HttpException({ status: 'indisponivel' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ok' };
  }
}
