import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import {
  AppointmentNotFoundError,
  ContactNotFoundError,
  InvalidAppointmentStateError,
  ServiceNotFoundError,
  SlotUnavailableError,
} from '../scheduling/scheduling.errors.js';

/** Erros de agenda viram respostas claras para o painel, em pt-BR. */
@Catch(
  SlotUnavailableError,
  AppointmentNotFoundError,
  ContactNotFoundError,
  ServiceNotFoundError,
  InvalidAppointmentStateError,
)
export class SchedulingErrorFilter implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const [status, message] =
      error instanceof SlotUnavailableError
        ? [HttpStatus.CONFLICT, 'Esse horário acabou de ser ocupado. Escolha outro.']
        : error instanceof InvalidAppointmentStateError
          ? [HttpStatus.CONFLICT, 'Esse horário não pode mais ser alterado assim.']
          : error instanceof ContactNotFoundError
            ? [HttpStatus.NOT_FOUND, 'Cliente não encontrada.']
            : error instanceof ServiceNotFoundError
              ? [HttpStatus.NOT_FOUND, 'Serviço não encontrado.']
              : [HttpStatus.NOT_FOUND, 'Horário não encontrado.'];
    res.status(status).json({ statusCode: status, message });
  }
}
