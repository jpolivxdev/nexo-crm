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
  isOpenAt,
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
  BUTTON_KEYS,
  BUTTON_MAX,
  checkMessageOverrides,
  DEFAULT_MESSAGES,
  MESSAGE_MAX,
  messageVariables,
  render,
  type MessageCheck,
  type MessageKey,
  type MessageOverrides,
} from './bot/messages.js';
export {
  choices,
  LIMITS,
  type Choice,
  type OutgoingMessage,
  type TemplateMessage,
} from './bot/outgoing.js';
export {
  localWhen,
  planReminders,
  REMINDER_LATE_TOLERANCE_MS,
  REMINDER_TEMPLATES,
  reminderMessage,
  reminderStillUseful,
  reminderTemplate,
  TEMPLATE_LANGUAGE,
  templateSubmission,
  type ReminderKind,
} from './bot/reminders.js';
export { globalCommand, normalize } from './bot/text.js';
export {
  classify,
  defaultStageFor,
  RULE_EVENTS,
  ruleEventOf,
  type ClassificationInput,
  type CrmEventType,
  type RuleEvent,
  type StageRef,
  type StageRule,
} from './crm/classification.js';
export type { StageKey } from './crm/pipeline-templates.js';
export {
  FEATURES,
  featuresOf,
  hasFeature,
  PLAN_FEATURES,
  type Feature,
  type PlanId,
} from './plans/features.js';
export {
  ACCESS_AREAS,
  accessRulesOf,
  areasFor,
  DEFAULT_ACCESS,
  TEAM_ROLES,
  type AccessArea,
  type AccessRules,
  type TeamRole,
} from './plans/access.js';
export { forecast, type Forecast, type ForecastBucket, type ForecastDeal } from './crm/forecast.js';
export {
  checkFieldValues,
  CUSTOM_FIELD_TYPES,
  FIELD_TEXT_MAX,
  type CustomFieldDef,
  type CustomFieldType,
  type FieldValue,
} from './crm/custom-fields.js';
export { csvCell, toCsv } from './crm/csv.js';
export {
  checkImport,
  detectColumns,
  IMPORT_MAX_ROWS,
  normalizePhone,
  parseCsv,
  type ImportColumns,
  type ImportRow,
  type ImportStatus,
} from './crm/import.js';
export {
  averageInterval,
  checkPortfolioRules,
  DEFAULT_PORTFOLIO_RULES,
  portfolioRulesOf,
  portfolioStatus,
  type PortfolioRules,
  type PortfolioStatus,
} from './crm/portfolio.js';
