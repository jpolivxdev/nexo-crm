import { Module } from '@nestjs/common';
import { ContactsPlusController } from './contacts-plus.controller.js';
import { ContactsPlusService } from './contacts-plus.service.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';

/** CRM completo do Premium. O quadro básico continua no PanelModule. */
@Module({
  controllers: [CrmController, ContactsPlusController],
  providers: [CrmService, ContactsPlusService],
})
export class CrmModule {}
