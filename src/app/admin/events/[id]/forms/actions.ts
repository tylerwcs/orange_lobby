"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { createForm, updateForm, deleteForm, getForm, type NewForm } from "@/lib/db/forms";
import { questionsFromForm } from "@/lib/questions-form";
import { FORM_QUESTION_TYPES } from "@/lib/registration";
import { MAX_FORM_QUESTIONS } from "@/lib/forms";
import { parseCategories } from "@/lib/agenda";
import { flashPath } from "@/lib/flash";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

const path = (eventId: string) => `/admin/events/${eventId}/forms`;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const checked = (fd: FormData, key: string) => fd.get(key) !== null;

/**
 * True only when `e` is `form_submissions_one_a_day` (0025_forms.sql) refusing a write —
 * never any other unique violation, and never a network failure, an outage, or anything
 * else `updateForm` might throw. Scoped to that one constraint by name, the same reasoning
 * `submit_form`'s exception handler gives (0026_submit_form.sql): 23505 alone is not enough,
 * because `form_submissions_pkey` fires the same error class, and reporting an unrelated
 * failure as "someone already submitted twice today" sends the organiser hunting for a
 * duplicate that does not exist.
 *
 * supabase-js's `PostgrestError` carries `code`, `message`, `details` and `hint` — no
 * separate constraint-name field — so the constraint name is read out of `message`, which is
 * Postgres's own text (`duplicate key value violates unique constraint "…"`) forwarded
 * verbatim by PostgREST.
 */
function isPerDayCollision(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  return code === "23505" && typeof message === "string" && message.includes("form_submissions_one_a_day");
}

/**
 * The fields the add form and the edit form share — everything but `submissions_open`
 * (owned by `toggleFormOpenAction` alone, the same reason `readActivityPolicy` leaves
 * `booking_open` out) and `sort_order` (nothing here reorders forms). Throws on anything
 * invalid; both actions below catch that and turn it into a flash rather than a 500.
 */
function readFormPolicy(fd: FormData): Omit<NewForm, "sort_order" | "submissions_open"> {
  const name = text(fd, "name");
  if (!name) throw new Error("A form needs a name");
  const maxRaw = text(fd, "max_per_attendee");
  let max_per_attendee: number | null = null;
  if (maxRaw) {
    max_per_attendee = Number.parseInt(maxRaw, 10);
    if (!Number.isFinite(max_per_attendee) || max_per_attendee < 1 || max_per_attendee > 366) {
      throw new Error("Submissions per attendee must be a whole number between 1 and 366, or left blank for no limit.");
    }
  }
  const questions = questionsFromForm(
    (k) => { const v = fd.get(k); return typeof v === "string" ? v : null; },
    FORM_QUESTION_TYPES,
    MAX_FORM_QUESTIONS,
  );
  return {
    name,
    description: text(fd, "description") || null,
    categories: parseCategories(text(fd, "categories")),
    max_per_attendee,
    per_day: checked(fd, "per_day"),
    questions,
  };
}

export async function addFormAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  let policy;
  try {
    policy = readFormPolicy(fd);
  } catch (e) {
    redirect(flashPath(path(eventId), (e as Error).message, "error"));
  }
  await createForm(ev.id, ev.org_id, { ...policy, submissions_open: checked(fd, "submissions_open"), sort_order: 0 });
  revalidatePath(path(eventId));
  redirect(flashPath(path(eventId), "Form added."));
}

/**
 * Never touches `submissions_open`: see `readFormPolicy`'s note.
 *
 * `updateForm` (src/lib/db/forms.ts) rewrites every one of this form's submissions' `per_day`
 * before it writes `forms` itself, so it can throw on the partial unique index if somebody
 * already submitted twice in one day. `isPerDayCollision` narrows that specific throw to a
 * sentence naming what to fix rather than a 500 (D165); anything else re-raises.
 */
export async function saveFormAction(eventId: string, formId: string, fd: FormData) {
  const ev = await event(eventId);
  let policy;
  try {
    policy = readFormPolicy(fd);
  } catch (e) {
    redirect(flashPath(path(eventId), (e as Error).message, "error"));
  }
  const current = await getForm(formId, ev.id);
  if (!current) redirect(flashPath(path(eventId), "That form no longer exists.", "error"));
  try {
    await updateForm(formId, ev.id, { ...policy, submissions_open: current.submissions_open, sort_order: current.sort_order });
  } catch (e) {
    // updateForm rewrites its submissions' per_day; the partial unique index refuses if
    // somebody already submitted twice on one day. Say so rather than showing a 500 (D165) —
    // but only for that specific refusal. Anything else (an outage, a network failure, some
    // other constraint) re-throws, so it surfaces as a real failure instead of a misleading
    // flash the organiser cannot act on.
    if (!isPerDayCollision(e)) throw e;
    redirect(flashPath(path(eventId), "Someone has already submitted twice in one day, so this form cannot become once-a-day. Delete the extra submission first.", "error"));
  }
  revalidatePath(path(eventId));
  redirect(flashPath(path(eventId), "Form saved."));
}

/**
 * The one control the organiser uses mid-event, so it is one click rather than a field
 * inside the edit form — the same reasoning as `toggleBookingAction` (D127).
 */
export async function toggleFormOpenAction(eventId: string, formId: string) {
  const ev = await event(eventId);
  const form = await getForm(formId, ev.id);
  if (!form) redirect(flashPath(path(eventId), "That form no longer exists.", "error"));
  const patch: NewForm = {
    name: form.name, description: form.description, questions: form.questions,
    categories: form.categories, max_per_attendee: form.max_per_attendee, per_day: form.per_day,
    sort_order: form.sort_order, submissions_open: !form.submissions_open,
  };
  await updateForm(formId, ev.id, patch);
  revalidatePath(path(eventId));
  redirect(flashPath(path(eventId), form.submissions_open ? "Form closed." : "Form open."));
}

/** Cascades its submissions (the same shape of decision `deleteActivityAction` makes), so the confirm dialog says how many go with it. */
export async function deleteFormAction(eventId: string, formId: string) {
  const ev = await event(eventId);
  await deleteForm(formId, ev.id);
  revalidatePath(path(eventId));
  redirect(flashPath(path(eventId), "Form deleted."));
}
