import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { SchedulingService } from './scheduling.service.js';

@Module({
  providers: [
    {
      provide: SchedulingService,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new SchedulingService(prisma),
    },
  ],
  exports: [SchedulingService],
})
export class SchedulingModule {}
