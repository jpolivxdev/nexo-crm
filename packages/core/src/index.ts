export {
  DEFAULT_PIPELINE,
  pipelineTemplateFor,
  type PipelineTemplate,
  type StageKind,
  type StageTemplate,
} from './crm/pipeline-templates.js';
export { maskPhone } from './privacy/mask-phone.js';
export {
  availableSlots,
  dayRangeUtc,
  DEFAULT_MIN_NOTICE_MINUTES,
  DEFAULT_STEP_MINUTES,
  isSlotAvailable,
  todayIn,
  type BusyInterval,
  type Slot,
  type SlotQuery,
  type WeeklyWindow,
} from './scheduling/slots.js';
export {
  addDays,
  utcToZoned,
  weekdayOf,
  zonedToUtc,
  type LocalDate,
  type ZonedParts,
} from './scheduling/timezone.js';
export {
  handle as handleBotMessage,
  type AppointmentSummary,
  type BookResult,
  type BotAction,
  type BotContext,
  type BotInput,
  type BotPorts,
  type BotResult,
  type BotState,
  type BotStep,
  type FaqItem,
  type ProfessionalOption,
  type ServiceOption,
} from './bot/machine.js';
export {
  DEFAULT_MESSAGES,
  render,
  type MessageKey,
  type MessageOverrides,
} from './bot/messages.js';
export { choices, LIMITS, type Choice, type OutgoingMessage } from './bot/outgoing.js';
export { globalCommand, normalize } from './bot/text.js';
