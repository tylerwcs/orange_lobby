import type { EventModule } from "@/lib/modules";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { PinnedField } from "@/lib/pinned-fields";

export type EventStatus = "draft" | "live" | "archived";

export type RegistrationQuestion = {
  key: string;
  label: string;
  type: "text" | "phone" | "number" | "select";
  required: boolean;
  options?: string[];
  description?: string;
  /** Show (and require) this question only when another answer contains a phrase. */
  show_when?: { key: string; includes: string };
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
  /**
   * Whether this event has a door at all (D159). Off hides the Scanner, the arrival stats,
   * the attendance export and the attendee's own arrival line; it never deletes a
   * checkpoint or a checkin, so switching it back on restores the event as it was.
   */
  check_in_enabled: boolean;
  /** The checkpoint the event is running right now; every surface follows it. */
  active_checkpoint_id: string | null;
  registration_questions: RegistrationQuestion[];
  /** Organiser-defined columns on the attendee table; values live in `Attendee.extra`. */
  attendee_fields: AttendeeField[];
  scan_extra_fields: string[];
  /** Facts shown on the badge card, in order. The first gets the large treatment. */
  pinned_fields: PinnedField[];
  /** How many stamps fill the Booth Passport. Null means every booth this event has. */
  stamps_required: number | null;
  /** What the passport says when it is full. Admin-authored, because the prize is decided late. */
  stamps_message: string | null;
  /** The shared crew scanner link's authority. Null until an admin mints one. Never shown to attendees. */
  crew_token: string | null;
  modules: EventModule[];
};

export type AttendeeSource = "import" | "registration" | "walkin";

export type Attendee = {
  id: string;
  org_id: string;
  event_id: string;
  token: string;
  name: string;
  email: string | null;
  category: string | null;
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
  /** The breakout round this item belongs to, e.g. "Breakout 1". Null on an ordinary item. */
  slot: string | null;
  /** This room's value within the slot, e.g. "3A". What the client's spreadsheet column holds. */
  code: string | null;
  /** A palette key from src/lib/agenda-colours.ts, or null. Decoration; nothing reads it back. */
  color: string | null;
  sort_order: number;
};

export type BreakoutAssignment = {
  id: string;
  event_id: string;
  agenda_item_id: string;
  attendee_id: string;
  /** Copied from the agenda item so `unique (attendee_id, slot)` can enforce one room per round. */
  slot: string;
};

export type Announcement = {
  id: string;
  event_id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
};

export type Checkpoint = { id: string; event_id: string; name: string; day: string; sort_order: number };

export type Checkin = {
  id: string;
  event_id: string;
  checkpoint_id: string;
  attendee_id: string;
  scanned_by: string | null;
  scanned_at: string;
};

export type Booth = {
  id: string;
  org_id: string;
  event_id: string;
  name: string;
  location: string | null;
  /** The booth's scanner authority. Printed as a QR; never shown to attendees. */
  token: string;
  sort_order: number;
};

export type BoothStamp = {
  id: string;
  org_id: string;
  event_id: string;
  booth_id: string;
  attendee_id: string;
  stamped_at: string;
};

export type Activity = {
  id: string;
  org_id: string;
  event_id: string;
  name: string;
  description: string | null;
  /** At least one booking is expected. Never max_per_attendee of them (D129). */
  required: boolean;
  booking_open: boolean;
  max_per_attendee: number;
  /** Null or empty means everyone, exactly as on an agenda item. */
  categories: string[] | null;
  sort_order: number;
};

export type ActivitySession = {
  id: string;
  event_id: string;
  activity_id: string;
  title: string;
  day: string;          // YYYY-MM-DD
  starts_at: string;    // HH:MM
  ends_at: string | null;
  location: string | null;
  capacity: number;
  sort_order: number;
};

export type ActivityBooking = {
  id: string;
  event_id: string;
  /** Copied from the session so the per-activity cap counts without a join (D124). */
  activity_id: string;
  session_id: string;
  attendee_id: string;
  created_at: string;
};

export type ActivityRequestKind = "switch" | "cancel";
export type ActivityRequestStatus = "pending" | "approved" | "declined" | "withdrawn";

/**
 * A change an attendee has asked for. The booking it refers to does not move until the
 * desk approves it (D143), so this row never affects a seat count on its own.
 */
export type ActivityChangeRequest = {
  id: string;
  event_id: string;
  activity_id: string;
  attendee_id: string;
  kind: ActivityRequestKind;
  /** The booking they hold now. */
  from_session_id: string;
  /** Where they want to go. Null for a cancel — the database enforces the pairing. */
  to_session_id: string | null;
  status: ActivityRequestStatus;
  created_at: string;
  decided_at: string | null;
  /** An `auth.users` id, as `checkins.scanned_by` is. */
  decided_by: string | null;
};
