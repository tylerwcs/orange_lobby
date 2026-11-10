"use server";
import { loadPortalAttendee, isDraftPreview } from "@/lib/portal";
import { categoryMatches } from "@/lib/agenda";
import { allow } from "@/lib/ratelimit";
import { getResult, getTestActivity, insertResult } from "./db/results";
import { checkPicks, cleanHolderName, pickPersonality, saveOutcome, type SaveResult, type TestPick } from "./lib/score";
import { readPassportTest } from "./lib/settings";

/**
 * D882, D883: "That's me". The server works the personality out from the picks - the client's
 * guess is never trusted - and saves it once. Refused while the passport is closed (goal 11, the
 * user's call: the test opens with the passport). A draft preview gets its result and saves
 * nothing (goal 22). A second save returns the stored result, so a double tap is harmless.
 */
export async function savePassportResultAction(
  slug: string, token: string, activityId: string, input: { picks: TestPick[]; holderName: string },
): Promise<SaveResult> {
  const { event, attendee } = await loadPortalAttendee(slug, token);
  if (!allow(`passport-test:${token}`, 10, 60_000)) return { ok: false, reason: "busy" };
  const activity = await getTestActivity(activityId, event.id);
  if (!activity || attendee.cancelled_at || !categoryMatches(activity.categories, attendee.category)) return { ok: false, reason: "missing" };
  const test = readPassportTest(activity.passport_test);
  if (!test.on) return { ok: false, reason: "off" };
  if (!activity.is_open) return { ok: false, reason: "closed" };
  const picks = Array.isArray(input?.picks) ? input.picks.slice(0, 20).map((p) => ({ questionId: String(p?.questionId), answerId: String(p?.answerId) })) : [];
  if (checkPicks(test, picks)) return { ok: false, reason: "invalid" };
  const computed = { personalityId: pickPersonality(test, picks), holderName: cleanHolderName(String(input?.holderName ?? ""), attendee.name) };
  if (await isDraftPreview(slug)) return saveOutcome(null, computed);
  const saved = await insertResult({
    org_id: event.org_id, event_id: event.id, activity_id: activity.id, attendee_id: attendee.id,
    personality_id: computed.personalityId, answers: picks, holder_name: computed.holderName,
  });
  return saveOutcome(saved ? null : await getResult(activity.id, attendee.id), computed);
}
