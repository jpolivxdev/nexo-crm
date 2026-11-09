import type { AccessArea } from './roles';

export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'NO_SHOW' | 'CANCELLED';

export interface Me {
  /** Login da sessão (nulo para a nexo numa entrada controlada). */
  userId?: string | null;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'CONSULTANT' | 'STAFF' | 'NEXO_ADMIN';
  csrfToken: string;
  mustChangePassword: boolean;
  /** Negócio da sessão (para o admin nexo, só durante uma entrada registrada). */
  businessName: string | null;
  onboardingPending: boolean;
  acting: { until: string } | null;
  /** Plano do negócio e o que ele libera. Quem trava de verdade é o servidor. */
  plan?: PlanId | null;
  features?: Feature[];
  /** Áreas que o papel acessa (Acessos por papel). Sem a lista, o servidor decide. */
  access?: AccessArea[];
  twoFactor?: boolean;
  /** O negócio exige 2FA e este login ainda não ligou: só a tela de ligar aparece. */
  mfaSetupRequired?: boolean;
}

export type PlanId = 'FREE' | 'CRM' | 'COMPLETE' | 'PREMIUM';

export type Feature =
  | 'report'
  | 'agenda'
  | 'bot'
  | 'reminders'
  | 'team_roles'
  | 'crm_plus'
  | 'contacts_plus'
  | 'dashboards';

export interface ContactRef {
  id: string;
  name: string | null;
  phone: string;
}

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: string;
  service: { id: string; name: string };
  professional: { id: string; name: string };
  contact: ContactRef;
}

export interface Today {
  date: string;
  businessName: string;
  timeZone: string;
  appointments: Appointment[];
  handoffs: {
    conversationId: string;
    since: string;
    contact: ContactRef;
    lastMessage: { body: string | null; createdAt: string } | null;
  }[];
  tasks: {
    id: string;
    title: string;
    dueAt: string | null;
    contact: { id: string; name: string | null } | null;
  }[];
  activity: ActivityItem[];
}

/** Um acontecimento recente do negócio ("O que aconteceu"). */
export interface ActivityItem {
  id: string;
  type: string;
  actorType: 'contact' | 'user' | 'system' | string;
  createdAt: string;
  contact: ContactRef | null;
}

export interface Agenda {
  from: string;
  days: number;
  timeZone: string;
  appointments: Appointment[];
}

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number | null;
}

export interface ContactListItem extends ContactRef {
  optedOutAt: string | null;
  deals: { stage: { id: string; name: string } }[];
  /** Só nas visões (frequentes, sumidas, faltosas): o número que explica a cliente estar ali. */
  stats?: { doneCount?: number; noShowCount?: number; lastDoneAt?: string };
}

export interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  body: string | null;
  status: string | null;
  createdAt: string;
}

export interface ContactFile extends ContactRef {
  timeZone: string;
  notes: string | null;
  tags: string[];
  optedOutAt: string | null;
  source: string;
  createdAt: string;
  deal: {
    id: string;
    stage: { id: string; name: string };
    stages: { id: string; name: string }[];
  } | null;
  appointments: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: AppointmentStatus;
    service: { name: string };
  }[];
  conversations: { id: string; channel: string; botPausedAt: string | null; messages: Message[] }[];
  tasks: { id: string; title: string; dueAt: string | null }[];
}

export interface PipelineDeal {
  id: string;
  /** Desde quando está nesta etapa. */
  since: string;
  /** Próximo horário marcado da cliente, se tiver. */
  nextAt: string | null;
  /** Serviço e preço do próximo horário (preço nulo quando o serviço não tem preço). */
  nextService?: string | null;
  valueCents?: number | null;
  /** Premium: o valor foi escrito pela equipe (não é o preço do próximo horário). */
  ownValue?: boolean;
  title?: string | null;
  owner?: { id: string; name: string } | null;
  campaign?: { id: string; name: string } | null;
  /** AAAA-MM-DD. */
  expectedCloseOn?: string | null;
  fields?: Record<string, string | number>;
  nextTask?: { id: string; title: string; kind: TaskKind; dueAt: string | null } | null;
  contact: ContactRef & { source?: string; tags?: string[] };
}

export type TaskKind = 'todo' | 'call' | 'follow_up' | 'meeting';

export interface ForecastBucket {
  month: string | null;
  count: number;
  openCents: number;
  weightedCents: number;
}

export interface Forecast {
  count: number;
  openCents: number;
  weightedCents: number;
  byMonth: ForecastBucket[];
}

export interface CrmPipeline {
  id: string;
  name: string;
  isDefault: boolean;
  openDeals: number;
  stages: {
    id: string;
    name: string;
    kind: 'OPEN' | 'WON' | 'LOST';
    probability: number | null;
    key: string | null;
  }[];
}

export interface Campaign {
  id: string;
  name: string;
  channel: string | null;
  startsOn: string | null;
  endsOn: string | null;
  budgetCents: number | null;
  archivedAt: string | null;
  pipeline: { id: string; name: string } | null;
  deals: number;
  won: number;
  wonCents: number;
}

export interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options: string[];
}

export interface Person {
  id: string;
  name: string;
  role: string;
}

export interface CrmTask {
  id: string;
  title: string;
  kind: TaskKind;
  dueAt: string | null;
  doneAt: string | null;
  dealId: string | null;
  contact: ContactRef | null;
  assignee: { id: string; name: string } | null;
}

export interface PipelineStage {
  id: string;
  name: string;
  key: string | null;
  kind: 'OPEN' | 'WON' | 'LOST';
  probability?: number | null;
  deals: PipelineDeal[];
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault?: boolean;
  timeZone: string;
  stages: PipelineStage[];
  forecast?: Forecast;
}

export interface SetupService {
  id?: string;
  name: string;
  durationMinutes: number;
  priceCents: number | null;
}

export interface SetupWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface SetupData {
  business: {
    name: string;
    attendantName: string;
    timezone: string;
    slotStepMinutes: number;
    minNoticeMinutes: number;
  };
  services: (SetupService & { id: string })[];
  windows: SetupWindow[];
  faq: { question: string; answer: string }[];
  onboardingCompletedAt: string | null;
}

export interface TenantRow {
  id: string;
  name: string;
  niche: string;
  plan?: PlanId;
  createdAt: string;
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  onboardingMinutes: number | null;
}

export interface ReportCount {
  id: string;
  name: string;
  count: number;
}

export interface Report {
  from: string;
  to: string;
  days: 7 | 30 | 90;
  newContacts: number;
  booked: { total: number; byBot: number; byPanel: number };
  outcomes: { done: number; noShow: number; cancelled: number; noShowRate: number | null };
  handoffs: number;
  optOuts: number;
  confirmedByClient: number;
  byStage: ReportCount[];
  byProfessional: ReportCount[];
  /** Um ponto por dia do período, no fuso do negócio. */
  daily: DailyCount[];
}

export interface DailyCount {
  date: string;
  booked: number;
  done: number;
}
