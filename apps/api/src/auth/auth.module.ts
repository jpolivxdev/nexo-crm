import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { createMailer, MAILER } from '../mail/mailer.js';
import { AccountService } from './account.service.js';
import { AuditService } from './audit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AdminGuard, SessionGuard, TenantGuard } from './session.guard.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AccountService,
    AuditService,
    SessionGuard,
    TenantGuard,
    AdminGuard,
    { provide: MAILER, useFactory: (env: Env) => createMailer(env), inject: [ENV] },
  ],
  exports: [AuthService, AuditService, SessionGuard, TenantGuard, AdminGuard],
})
export class AuthModule {}
