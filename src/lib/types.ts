import type { EventModule } from "@/lib/modules";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { PinnedField } from "@/lib/pinned-fields";

export type EventStatus = "draft" | "live" | "archived";

export type QuestionType = "text" | "phone" | "number" | "select" | "textarea" | "file";

export type RegistrationQuestion = {
  key: string;
  label: string;
  /**
   * Which of these a given context actually allows is decided by the allowlist
   * `parseQuestions` is called with, not by this union (D164). Registration keeps the
   * original four; forms add textarea and file.
   */
  type: QuestionType;
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
  /** Organiser pictures for the launcher's own sections, keyed "agenda" / "info" (D222). Read through `sectionIcons`. */
  section_icons: Record<string, unknown>;
  registration_open: boolean;
  /** The line under the Register heading; null for DEFAULT_REGISTRATION_INTRO (D229). */
  registration_intro: string | null;
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
  /** Attendee field keys every export except Attendance carries after its fixed columns, in order. */
  export_fields: string[];
  /** Facts shown on the badge card, in order. The first gets the large treatment. */
  pinned_fields: PinnedField[];
  /** The shared crew scanner link's authority. Null until an admin mints one. Never shown to attendees. */
  crew_token: string | null;
  modules: EventModule[];
};

/** One named tab of the Info page (D202). Its HTML is sanitized on save and again on render. */
export type InfoTab = {
  id: string;
  org_id: string;
  event_id: string;
  title: string;
  /** Null when the organiser has not written anything yet; such a tab is hidden (D205). */
  html: string | null;
  sort_order: number;
  /** Who sees it, as on agenda rows: null for everyone (categoryMatches). */
  categories: string[] | null;
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

/** A day of the programme, made before anything is put on it (D193). */
export type AgendaDay = {
  id: string;
  org_id: string;
  event_id: string;
  date: string;         // YYYY-MM-DD, unique per event
  /** "Day 1 (Conference)". Null: the day is labelled by its date everywhere. */
  name: string | null;
};

/** A session has a time; an image row is a picture placed in the programme and has none (D196). */
export type AgendaItemKind = "session" | "image";

export type AgendaItem = {
  id: string;
  event_id: string;
  /** The day this row is on (D194). Null only on rows `bookedAgendaRows` derives from a booking. */
  day_id: string | null;
  /** A copy of the day's date that the database keeps in sync (D194). Read it; never write it. */
  day: string;          // YYYY-MM-DD
  kind: AgendaItemKind;
  /** HH:MM. Null only on an image row, which has no time (D196). */
  starts_at: string | null;
  ends_at: string | null;
  /** A session's title; an image row's optional caption, "" when it has none. */
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
  /**
   * A picture for this session — a speaker, a room, a poster (D160). Null on most items,
   * and always null on the rows `bookedAgendaRows` derives from a booking, which are not
   * agenda items and have no image of their own.
   */
  image_url: string | null;
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
  /** The organiser's order (D249); attendees see them in it. */
  sort_order: number;
  created_at: string;
  /** Who sees it, as on agenda rows: null for everyone (categoryMatches). */
  categories: string[] | null;
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
  /** The passport this booth stamps into (D180). */
  activity_id: string;
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

/** What an attendee does with an activity: take a seat, send answers, or collect stamps (D178, D179). */
export type ActivityKind = "booking" | "submission" | "passport";

export type Activity = {
  id: string;
  org_id: string;
  event_id: string;
  name: string;
  description: string | null;
  /**
   * Which half of the policy below actually applies. `booking` uses sessions and capacity;
   * `submission` uses questions and per_day; `passport` uses booths and a stamp target.
   * All three share categories, the open flag, the cap and `required` — that shared half
   * is why they are one table (D178, D179).
   */
  kind: ActivityKind;
  /** At least one booking or one submission is expected. Never max_per_attendee of them (D129). */
  required: boolean;
  /** Flipped by hand; there is deliberately no scheduled close (D127). */
  is_open: boolean;
  /** The total one attendee may ever take. Null is no cap (D178); otherwise 1..366. */
  max_per_attendee: number | null;
  /** Null or empty means everyone, exactly as on an agenda item. */
  categories: string[] | null;
  /** Submission kind only. Empty on a booking activity — a fact, not a missing value. */
  questions: RegistrationQuestion[];
  /** Submission kind only. At most one submission per Malaysian calendar day (D171). */
  per_day: boolean;
  /** The organiser's picture for the activity - a poster, the rules: cropped on its card, whole across the top of its page. Either kind. */
  image_url: string | null;
  /** Submission kind only - a booking's dates and place come from its sessions. YYYY-MM-DD. */
  starts_on: string | null;
  /** Optional; with no end date the activity is the one day `starts_on`. */
  ends_on: string | null;
  /** Submission kind only. Free text, shown like a booking's location. */
  venue: string | null;
  /** Submission kind only. The attendee's button; "Submit" when null (`submitLabel`). */
  action_label: string | null;
  /** Passport kind only. How many stamps fill the card; null is every booth (D182). */
  stamps_required: number | null;
  /** Passport kind only. Shown once the card is full - the prize, in the organiser's words (D96). */
  reward_message: string | null;
  sort_order: number;
};

export type ActivitySession = {
  id: string;
  event_id: string;
  activity_id: string;
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

/**
 * A set of questions an eligible attendee may answer, possibly more than once (D161).
 *
 * The policy fields mirror `activities` — categories, an open flag, a per-attendee cap —
 * because that is the half of activities forms actually branch from. There is no session
 * and no capacity: a submission is not a seat.
 */
export type ActivitySubmission = {
  id: string;
  event_id: string;
  activity_id: string;
  attendee_id: string;
  /** Question key to answer. A `file` answer holds an object path, never a URL (D167). */
  answers: Record<string, string>;
  /** The Malaysian calendar day this counts against (D165). */
  submitted_on: string; // YYYY-MM-DD
  /** Room for a review queue that is not built yet; nothing branches on it (D170). */
  status: string;
  /** Denormalised from the form so the partial unique index needs no join (D165). */
  per_day: boolean;
  created_at: string;
};
