import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { PlanGuard, RequiresFeature } from '../auth/plan.guard.js';
import { RequiresAccess, SessionGuard, TenantGuard } from '../auth/session.guard.js';
import {
  archiveCampaignBody,
  campaignBody,
  customFieldBody,
  dealBody,
  exportQuery,
  newDealBody,
  pipelineBody,
  pipelineUpdateBody,
  taskBody,
  tasksQuery,
} from './crm.schemas.js';
import { CrmService, type CrmActor } from './crm.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * CRM completo (Premium). Dono, gestor e consultor usam o quadro e as tarefas; mexer em funis,
 * campanhas e campos é da área "Configurações"; exportar é da área "Privacidade".
 */
@Controller('panel/crm')
@UseGuards(SessionGuard, TenantGuard, PlanGuard)
@RequiresFeature('crm_plus')
export class CrmController {
  constructor(@Inject(CrmService) private readonly crm: CrmService) {}

  private tenant(req: AuthedRequest) {
    return req.auth!.tenantId!;
  }

  private actor(req: AuthedRequest): CrmActor {
    return { userId: req.auth!.userId, role: req.auth!.role, ip: req.ip ?? null };
  }

  @Get('pipelines')
  pipelines(@Req() req: AuthedRequest) {
    return this.crm.pipelines(this.tenant(req));
  }

  @RequiresAccess('settings')
  @Post('pipelines')
  createPipeline(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.crm.createPipeline(this.tenant(req), parse(pipelineBody, body), this.actor(req));
  }

  @RequiresAccess('settings')
  @Put('pipelines/:id')
  updatePipeline(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.crm.updatePipeline(
      this.tenant(req),
      id,
      parse(pipelineUpdateBody, body),
      this.actor(req),
    );
  }

  @RequiresAccess('settings')
  @Delete('pipelines/:id')
  @HttpCode(200)
  deletePipeline(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.crm.deletePipeline(this.tenant(req), id, this.actor(req));
  }

  @Get('people')
  people(@Req() req: AuthedRequest) {
    return this.crm.people(this.tenant(req));
  }

  @Post('deals')
  createDeal(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.crm.createDeal(this.tenant(req), parse(newDealBody, body), this.actor(req));
  }

  @Put('deals/:id')
  updateDeal(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.crm.updateDeal(this.tenant(req), id, parse(dealBody, body), this.actor(req));
  }

  @Get('campaigns')
  campaigns(@Req() req: AuthedRequest) {
    return this.crm.campaigns(this.tenant(req));
  }

  @RequiresAccess('settings')
  @Post('campaigns')
  createCampaign(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.crm.saveCampaign(
      this.tenant(req),
      null,
      parse(campaignBody, body),
      this.actor(req),
    );
  }

  @RequiresAccess('settings')
  @Put('campaigns/:id')
  updateCampaign(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.crm.saveCampaign(this.tenant(req), id, parse(campaignBody, body), this.actor(req));
  }

  @RequiresAccess('settings')
  @Post('campaigns/:id/archive')
  @HttpCode(200)
  archiveCampaign(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    const { archived } = parse(archiveCampaignBody, body);
    return this.crm.archiveCampaign(this.tenant(req), id, archived);
  }

  @Get('fields')
  fields(@Req() req: AuthedRequest) {
    return this.crm.fields(this.tenant(req));
  }

  @RequiresAccess('settings')
  @Post('fields')
  createField(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.crm.saveField(
      this.tenant(req),
      null,
      parse(customFieldBody, body),
      this.actor(req),
    );
  }

  @RequiresAccess('settings')
  @Put('fields/:id')
  updateField(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.crm.saveField(this.tenant(req), id, parse(customFieldBody, body), this.actor(req));
  }

  @RequiresAccess('settings')
  @Delete('fields/:id')
  @HttpCode(200)
  deleteField(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.crm.deleteField(this.tenant(req), id, this.actor(req));
  }

  @Get('tasks')
  tasks(@Req() req: AuthedRequest, @Query() query: unknown) {
    const { scope, done } = parse(tasksQuery, query);
    return this.crm.tasks(this.tenant(req), this.actor(req), scope, done === 'true');
  }

  @Post('tasks')
  createTask(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.crm.createTask(this.tenant(req), parse(taskBody, body), this.actor(req));
  }

  @Post('tasks/:id/reopen')
  @HttpCode(200)
  reopenTask(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.crm.reopenTask(this.tenant(req), id);
  }

  @RequiresAccess('privacy')
  @Get('export.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="funil.csv"')
  @Header('cache-control', 'no-store')
  exportCsv(@Req() req: AuthedRequest, @Query() query: unknown) {
    const { pipelineId } = parse(exportQuery, query);
    return this.crm.exportCsv(this.tenant(req), pipelineId, this.actor(req));
  }
}
