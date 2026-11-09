import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
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
import { WikiService, type WikiActor } from './wiki.service.js';

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return result.data;
}

const uuid = new ParseUUIDPipe({ version: '4' });
const articleBody = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Dê um título com pelo menos 2 letras.')
    .max(120, 'Use até 120 letras no título.'),
  body: z.string().max(50_000, 'O artigo passou de 50 mil letras. Divida em dois.').default(''),
  categoryId: z.uuid().nullable().default(null),
  pinned: z.boolean().default(false),
});
const categoryBody = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome da categoria precisa de pelo menos 2 letras.')
    .max(40, 'Use até 40 letras no nome da categoria.'),
});
const listQuery = z.object({
  q: z.string().max(100).optional(),
  categoryId: z.uuid().optional(),
});

/** Wiki do negócio (Premium). Leitura para toda a equipe; escrita conferida no serviço. */
@Controller('panel/wiki')
@UseGuards(SessionGuard, TenantGuard, PlanGuard)
@RequiresFeature('wiki')
@AllowStaff()
export class WikiController {
  constructor(@Inject(WikiService) private readonly wiki: WikiService) {}

  private actor(req: AuthedRequest): WikiActor {
    return { userId: req.auth!.userId, name: req.auth!.name, role: req.auth!.role };
  }

  private tenant(req: AuthedRequest) {
    return req.auth!.tenantId!;
  }

  @Get()
  list(@Req() req: AuthedRequest, @Query() query: unknown) {
    const { q, categoryId } = parse(listQuery, query);
    return this.wiki.list(this.tenant(req), q, categoryId, this.actor(req));
  }

  @Get('articles/:id')
  get(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.wiki.get(this.tenant(req), id, this.actor(req));
  }

  @Post('articles')
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.wiki.create(this.tenant(req), parse(articleBody, body), this.actor(req));
  }

  @Put('articles/:id')
  update(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.wiki.update(this.tenant(req), id, parse(articleBody, body), this.actor(req));
  }

  @Post('articles/:id/archive')
  @HttpCode(200)
  archive(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.wiki.archive(this.tenant(req), id, this.actor(req));
  }

  @Post('categories')
  createCategory(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.wiki.createCategory(
      this.tenant(req),
      parse(categoryBody, body).name,
      this.actor(req),
    );
  }

  @Put('categories/:id')
  renameCategory(@Req() req: AuthedRequest, @Param('id', uuid) id: string, @Body() body: unknown) {
    return this.wiki.renameCategory(
      this.tenant(req),
      id,
      parse(categoryBody, body).name,
      this.actor(req),
    );
  }

  @Delete('categories/:id')
  removeCategory(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.wiki.removeCategory(this.tenant(req), id, this.actor(req));
  }

  /**
   * Anexo: corpo cru (application/octet-stream), nome no cabeçalho x-file-name (codificado).
   * O tipo é conferido pelo conteúdo no serviço.
   */
  @Post('articles/:id/attachments')
  attach(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException('Envie o arquivo como application/octet-stream.');
    }
    let name: string;
    try {
      name = decodeURIComponent(String(req.headers['x-file-name'] ?? ''));
    } catch {
      throw new BadRequestException('Nome de arquivo inválido.');
    }
    return this.wiki.attach(this.tenant(req), id, name, body, this.actor(req));
  }

  @Delete('attachments/:id')
  removeAttachment(@Req() req: AuthedRequest, @Param('id', uuid) id: string) {
    return this.wiki.removeAttachment(this.tenant(req), id, this.actor(req));
  }

  /** Imagem abre na página; o resto sempre baixa. Nada é interpretado pelo navegador. */
  @Get('attachments/:id')
  async file(
    @Req() req: AuthedRequest,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.wiki.file(this.tenant(req), id, this.actor(req));
    const inline = file.mime.startsWith('image/');
    res.setHeader('content-type', file.mime);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'private, max-age=300');
    res.setHeader(
      'content-disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    return new StreamableFile(Buffer.from(file.data));
  }
}
