import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.types.js';
import { PlanGuard, RequiresFeature } from '../auth/plan.guard.js';
import { AllowStaff, SessionGuard, TenantGuard } from '../auth/session.guard.js';
import { BoardService, type BoardActor } from './board.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

const uuid = new ParseUUIDPipe({ version: '4' });
const title = z
  .string()
  .trim()
  .min(2, 'Dê um nome com pelo menos 2 letras.')
  .max(80, 'Use até 80 letras no nome do quadro.');
const titleBody = z.object({ title });
const saveBody = z.object({
  title: title.optional(),
  elements: z.array(z.unknown()),
  version: z.number().int().min(1),
});

/** Corpo cru (application/octet-stream) das rotas grandes: lido aqui como JSON ou imagem. */
function rawBody(req: AuthedRequest): Buffer {
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body)) {
    throw new BadRequestException('Envie como application/octet-stream.');
  }
  return body;
}

/** Quadro branco (Premium). Toda a equipe usa, inclusive a profissional. */
@Controller('panel/boards')
@UseGuards(SessionGuard, TenantGuard, PlanGuard)
@RequiresFeature('whiteboard')
@AllowStaff()
export class BoardController {
  constructor(@Inject(BoardService) private readonly boards: BoardService) {}

  private actor(req: AuthedRequest): BoardActor {
    return { userId: req.auth!.userId, name: req.auth!.name, role: req.auth!.role };
  }

  private tenant(req: AuthedRequest) {
    return req.auth!.tenantId!;
  }

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.boards.list(this.tenant(req), this.actor(req));
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.boards.create(this.tenant(req), parse(titleBody, body).title, this.actor(req));
  }

  @Get('files/:id')
  async file(
    @Req() req: AuthedRequest,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.boards.file(this.tenant(req), id, this.actor(req));
    res.setHeader('content-type', file.mime);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('content-disposition', 'inline');
    res.setHeader('cache-control', 'private, max-age=3600');
    return new StreamableFile(Buffer.from(file.data));
  }

  @Get(':id')
  get(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.boards.get(this.tenant(req), id, this.actor(req));
  }

  /** Salva o desenho. Vem cru porque um quadro com muito traço passa do limite do JSON comum. */
  @Put(':id')
  save(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    let json: unknown;
    try {
      json = JSON.parse(rawBody(req).toString('utf8'));
    } catch {
      throw new BadRequestException('Quadro inválido.');
    }
    return this.boards.save(this.tenant(req), id, parse(saveBody, json), this.actor(req));
  }

  @Put(':id/title')
  rename(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.boards.rename(this.tenant(req), id, parse(titleBody, body).title, this.actor(req));
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.boards.archive(this.tenant(req), id, this.actor(req));
  }

  @Post(':id/files')
  addFile(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    let name: string;
    try {
      name = decodeURIComponent(String(req.headers['x-file-name'] ?? ''));
    } catch {
      throw new BadRequestException('Nome de arquivo inválido.');
    }
    return this.boards.addFile(this.tenant(req), id, name, rawBody(req), this.actor(req));
  }
}
