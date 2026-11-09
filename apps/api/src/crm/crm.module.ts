import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';

/** CRM completo do Premium. O quadro básico continua no PanelModule. */
@Module({
  controllers: [CrmController],
  providers: [CrmService],
})
export class CrmModule {}
