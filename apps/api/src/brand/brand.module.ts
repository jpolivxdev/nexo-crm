import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import express from 'express';
import { BrandController, PublicBrandController, TemplatesController } from './brand.controller.js';
import { BrandService, DnsLookup, LOGO_MAX_BYTES } from './brand.service.js';

/** Marca, domínio próprio e modelos de mensagem (Premium). */
@Module({
  controllers: [BrandController, TemplatesController, PublicBrandController],
  providers: [BrandService, DnsLookup],
  exports: [BrandService],
})
export class BrandModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(express.raw({ type: 'application/octet-stream', limit: LOGO_MAX_BYTES + 1024 }))
      .forRoutes({ path: 'panel/brand/logo', method: RequestMethod.POST });
  }
}
