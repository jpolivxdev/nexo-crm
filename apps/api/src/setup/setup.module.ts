import { Module } from '@nestjs/common';
import { AccessController } from './access.controller.js';
import { AlertsController } from './alerts.controller.js';
import { SetupController } from './setup.controller.js';
import { SetupService } from './setup.service.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';
import { TimeOffController } from './time-off.controller.js';
import { TimeOffService } from './time-off.service.js';

@Module({
  controllers: [
    SetupController,
    TimeOffController,
    TeamController,
    AlertsController,
    AccessController,
  ],
  providers: [SetupService, TimeOffService, TeamService],
})
export class SetupModule {}
