import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AdminGuard, SessionGuard, TenantGuard } from './session.guard.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuditService, SessionGuard, TenantGuard, AdminGuard],
  exports: [AuthService, AuditService, SessionGuard, TenantGuard, AdminGuard],
})
export class AuthModule {}
