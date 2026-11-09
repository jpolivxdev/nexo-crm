import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { WIKI_FILE_MAX_BYTES } from '@nexo/core';
import express from 'express';
import { BoardController } from './board.controller.js';
import { BoardService } from './board.service.js';

/** Quadro branco (Premium). Desenho e imagem vêm crus, com limite de tamanho por rota. */
@Module({ controllers: [BoardController], providers: [BoardService] })
export class BoardModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(express.raw({ type: 'application/octet-stream', limit: '3mb' }))
      .forRoutes({ path: 'panel/boards/:id', method: RequestMethod.PUT });
    consumer
      .apply(express.raw({ type: 'application/octet-stream', limit: WIKI_FILE_MAX_BYTES + 1024 }))
      .forRoutes({ path: 'panel/boards/:id/files', method: RequestMethod.POST });
  }
}
