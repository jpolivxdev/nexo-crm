import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { SchedulingService } from './scheduling.service.js';

@Module({
  providers: [
    {
      provide: SchedulingService,
      inject: [PrismaService, RealtimeBus],
      useFactory: (prisma: PrismaService, bus: RealtimeBus) => new SchedulingService(prisma, bus),
    },
  ],
  exports: [SchedulingService],
})
export class SchedulingModule {}
