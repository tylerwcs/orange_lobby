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
 * already submitted twice in one day. That throw is caught here and turned into a sentence
 * naming what to fix, not a 500 (D165).
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
  } catch {
    // updateForm rewrites its submissions' per_day; the partial unique index refuses if
    // somebody already submitted twice on one day. Say so rather than showing a 500 (D165).
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
