export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'NO_SHOW' | 'CANCELLED';

export interface Me {
  name: string;
  role: 'OWNER' | 'STAFF' | 'NEXO_ADMIN';
  csrfToken: string;
  mustChangePassword: boolean;
  /** Negócio da sessão (para o admin nexo, só durante uma entrada registrada). */
  businessName: string | null;
  onboardingPending: boolean;
  acting: { until: string } | null;
}

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

export interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string; deals: { id: string; contact: ContactRef }[] }[];
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
