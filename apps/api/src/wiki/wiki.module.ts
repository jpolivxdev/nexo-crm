import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { WIKI_FILE_MAX_BYTES } from '@nexo/core';
import express from 'express';
import { WikiController } from './wiki.controller.js';
import { WikiService } from './wiki.service.js';

/** Wiki do negócio (Premium). Só a rota de anexo aceita corpo cru, até o limite do arquivo. */
@Module({ controllers: [WikiController], providers: [WikiService] })
export class WikiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(express.raw({ type: 'application/octet-stream', limit: WIKI_FILE_MAX_BYTES + 1024 }))
      .forRoutes({ path: 'panel/wiki/articles/:id/attachments', method: RequestMethod.POST });
  }
}
