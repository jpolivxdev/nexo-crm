import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DASHBOARD_PERIODS } from '@nexo/core';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { PlanGuard, RequiresFeature } from '../auth/plan.guard.js';
import { RequiresAccess, SessionGuard, TenantGuard } from '../auth/session.guard.js';
import type { CrmActor } from './crm.service.js';
import { DashboardService } from './dashboard.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

const period = z
  .enum(DASHBOARD_PERIODS as [string, ...string[]])
  .transform((v) => v as (typeof DASHBOARD_PERIODS)[number]);

const dashboardQuery = z.object({
  period: period.default('month'),
  pipelineId: z.uuid().optional(),
  ownerUserId: z.uuid().optional(),
});

const goal = z.number().int().min(1).max(1_000_000_000).nullable().optional();
const goalsBody = z.object({
  period,
  goals: z.object({ newContacts: goal, wonCount: goal, doneCount: goal, revenueCents: goal }),
});

/** Painéis (Premium). Números e metas são da área Resultados; o painel geral do Hoje, de todos. */
@Controller('panel/crm')
@UseGuards(SessionGuard, TenantGuard, PlanGuard)
@RequiresFeature('dashboards')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboards: DashboardService) {}

  private actor(req: AuthedRequest): CrmActor {
    return { userId: req.auth!.userId, role: req.auth!.role, ip: req.ip ?? null };
  }

  @RequiresAccess('reports')
  @Get('dashboard')
  dashboard(@Req() req: AuthedRequest, @Query() query: unknown) {
    return this.dashboards.dashboard(req.auth!.tenantId!, parse(dashboardQuery, query));
  }

  @RequiresAccess('reports')
  @Put('dashboard/goals')
  saveGoals(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { period: p, goals } = parse(goalsBody, body);
    const clean = Object.fromEntries(
      Object.entries(goals).filter(([, v]) => typeof v === 'number'),
    ) as Record<string, number>;
    return this.dashboards.saveGoals(req.auth!.tenantId!, p, clean, this.actor(req));
  }

  @RequiresAccess('reports')
  @Get('overview')
  overview(@Req() req: AuthedRequest) {
    return this.dashboards.overview(req.auth!.tenantId!);
  }
}
