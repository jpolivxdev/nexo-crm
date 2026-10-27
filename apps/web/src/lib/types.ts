export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'NO_SHOW' | 'CANCELLED';

export interface Me {
  name: string;
  role: 'OWNER' | 'STAFF' | 'NEXO_ADMIN';
  csrfToken: string;
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
