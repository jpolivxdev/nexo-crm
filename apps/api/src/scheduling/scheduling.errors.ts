/** Erros de domínio da agenda. A camada HTTP (E8) traduz para mensagens na tela. */

export class SlotUnavailableError extends Error {
  constructor() {
    super('Esse horário não está mais livre.');
    this.name = 'SlotUnavailableError';
  }
}

export class AppointmentNotFoundError extends Error {
  constructor() {
    super('Horário não encontrado.');
    this.name = 'AppointmentNotFoundError';
  }
}

export class InvalidAppointmentStateError extends Error {
  constructor(from: string, to: string) {
    super(`Não é possível mudar o horário de ${from} para ${to}.`);
    this.name = 'InvalidAppointmentStateError';
  }
}

export class ServiceNotFoundError extends Error {
  constructor() {
    super('Serviço não encontrado.');
    this.name = 'ServiceNotFoundError';
  }
}

export class ContactNotFoundError extends Error {
  constructor() {
    super('Cliente não encontrada.');
    this.name = 'ContactNotFoundError';
  }
}

/** O banco recusou por sobreposição (restrição appointments_no_overlap, código 23P01). */
export function isOverlapViolation(error: unknown): boolean {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { code?: string } } } })?.meta;
  return meta?.driverAdapterError?.cause?.code === '23P01';
}
