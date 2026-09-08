export type EventStatus = "draft" | "live" | "archived";

export type RegistrationQuestion = {
  key: string;
  label: string;
  type: "text" | "select";
  required: boolean;
  options?: string[];
  description?: string;
};

export type Event = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  status: EventStatus;
  starts_on: string | null;
  ends_on: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_map_url: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string;
  floor_plan_url: string | null;
  info_page_title: string;
  info_page_html: string | null;
  registration_open: boolean;
  registration_closes_at: string | null;
  registration_questions: RegistrationQuestion[];
  scan_extra_fields: string[];
};

export type AttendeeSource = "import" | "registration" | "walkin";

export type Attendee = {
  id: string;
  org_id: string;
  event_id: string;
  token: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  category: string | null;
  table_no: string | null;
  seat_no: string | null;
  extra: Record<string, string>;
  source: AttendeeSource;
  status: string;
};

export type AgendaItem = {
  id: string;
  event_id: string;
  day: string;          // YYYY-MM-DD
  starts_at: string;    // HH:MM
  ends_at: string | null;
  title: string;
  description: string | null;
  location: string | null;
  categories: string[] | null;
  sort_order: number;
};

export type Announcement = {
  id: string;
  event_id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
};

export type Checkpoint = { id: string; event_id: string; name: string; sort_order: number };

export type Checkin = {
  id: string;
  event_id: string;
  checkpoint_id: string;
  attendee_id: string;
  scanned_by: string | null;
  scanned_at: string;
};
