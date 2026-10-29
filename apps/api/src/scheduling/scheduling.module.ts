import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { OwnerAlerts } from './owner-alerts.js';
import { SchedulingService } from './scheduling.service.js';

@Module({
  providers: [
    {
      provide: OwnerAlerts,
      inject: [PrismaService, MAILER],
      useFactory: (prisma: PrismaService, mailer: Mailer) => new OwnerAlerts(prisma, mailer),
    },
    {
      provide: SchedulingService,
      inject: [PrismaService, RealtimeBus, OwnerAlerts],
      useFactory: (prisma: PrismaService, bus: RealtimeBus, alerts: OwnerAlerts) =>
        new SchedulingService(prisma, bus, alerts),
    },
  ],
  exports: [SchedulingService, OwnerAlerts],
})
export class SchedulingModule {}
