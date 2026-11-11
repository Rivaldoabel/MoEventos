import type { EventItem, Ticket, ScanLog } from "../types";

const now = new Date();
const date = (offset: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const demoEvents: EventItem[] = [
  { id: "evt-001", name: "Conferência de Tecnologia 2026", description: "Um encontro dedicado à inovação, tecnologia e transformação digital.", venue: "Centro Cultural Sine Saje, Ndalatando", event_date: date(12), event_time: "09:00", visibility: "public", status: "published", capacity: 500, ticket_price: 5000, created_at: now.toISOString() },
  { id: "evt-002", name: "Noite de Gala — Conexões", description: "Uma noite de celebração, networking e entretenimento.", venue: "Hotel Ndalatando", event_date: date(20), event_time: "19:00", visibility: "public", status: "published", capacity: 250, ticket_price: 12000, created_at: now.toISOString() },
  { id: "evt-003", name: "Celebração Familiar", description: "Cerimónia privada por convite.", venue: "Espaço privado", event_date: date(28), event_time: "15:00", visibility: "private", status: "published", capacity: 120, ticket_price: 0, created_at: now.toISOString() }
];

export const demoTickets: Ticket[] = [
  { id: "tic-001", event_id: "evt-001", guest_name: "João Manuel", guest_email: "joao@example.com", code: "MO-TEC-0001", status: "valid", created_at: now.toISOString() },
  { id: "tic-002", event_id: "evt-001", guest_name: "Ana Pedro", guest_email: "ana@example.com", code: "MO-TEC-0002", status: "used", created_at: now.toISOString(), used_at: now.toISOString() },
  { id: "tic-003", event_id: "evt-002", guest_name: "Carlos António", guest_email: "carlos@example.com", code: "MO-GAL-0001", status: "valid", created_at: now.toISOString() },
  { id: "tic-004", event_id: "evt-003", guest_name: "Maria José", guest_email: "maria@example.com", code: "MO-PRI-0001", status: "valid", created_at: now.toISOString() }
];

export const demoLogs: ScanLog[] = [
  { id: "log-001", event_id: "evt-001", ticket_id: "tic-002", guest_name: "Ana Pedro", code: "MO-TEC-0002", result: "ACEITE", reason: "Entrada autorizada.", operator_name: "Operador de demonstração", scanned_at: now.toISOString() },
  { id: "log-002", event_id: "evt-001", ticket_id: "tic-002", guest_name: "Ana Pedro", code: "MO-TEC-0002", result: "RECUSADO", reason: "Ingresso já utilizado.", operator_name: "Operador de demonstração", scanned_at: now.toISOString() }
];
