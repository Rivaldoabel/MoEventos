export type Role = "platform_admin" | "event_admin" | "operator";
export type EventVisibility = "public" | "private";
export type EventStatus = "draft" | "published" | "completed" | "cancelled";
export type TicketStatus = "valid" | "used" | "cancelled" | "pending";

export interface EventItem {
  id: string;
  name: string;
  description: string;
  venue: string;
  event_date: string;
  event_time: string;
  visibility: EventVisibility;
  status: EventStatus;
  capacity: number;
  cover_url?: string;
  ticket_price: number;
  created_at: string;
}
export interface Ticket {
  id: string;
  event_id: string;
  guest_name: string;
  guest_email: string;
  code: string;
  status: TicketStatus;
  created_at: string;
  used_at?: string;
}
export interface ScanLog {
  id: string;
  event_id: string;
  ticket_id?: string;
  guest_name: string;
  code: string;
  result: "ACEITE" | "RECUSADO";
  reason: string;
  operator_name: string;
  scanned_at: string;
}
