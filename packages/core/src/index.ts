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
