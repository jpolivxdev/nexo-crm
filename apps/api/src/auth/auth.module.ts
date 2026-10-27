import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionGuard, TenantGuard } from './session.guard.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuditService, SessionGuard, TenantGuard],
  exports: [AuthService, AuditService, SessionGuard, TenantGuard],
})
export class AuthModule {}
