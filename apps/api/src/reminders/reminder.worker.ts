import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { ReminderService } from './reminder.service.js';

const INTERVAL_MS = 60_000;

/** No processo do worker, confere a cada minuto se há lembrete para mandar. */
@Injectable()
export class ReminderWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReminderWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(ENV) private readonly env: Pick<Env, 'RUN_WORKER'>,
    @Inject(ReminderService) private readonly reminders: ReminderService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.RUN_WORKER) return;
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return; // a rodada anterior ainda não terminou
    this.running = true;
    try {
      const totals = await this.reminders.runDue();
      if (totals.sent || totals.needs_template) {
        this.logger.log(
          `Lembretes: ${totals.sent} enviados, ${totals.needs_template} esperando mensagem de modelo.`,
        );
      }
    } catch (error) {
      this.logger.error(`Falha na rodada de lembretes: ${(error as Error).name}`);
    } finally {
      this.running = false;
    }
  }
}
