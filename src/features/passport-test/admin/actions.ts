"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { deleteEventImage, nextImage, type ImageChange } from "@/lib/db/media";
import { featureForActivityKind, requireFeature } from "@/features/catalogue";
import type { Activity, Event } from "@/lib/types";
import { countResults, getTestActivity, saveTest } from "../db/results";
import { readLookForm, readPersonalityForm, readQuestionForm } from "../lib/forms";
import { lockedChange, testProblems } from "../lib/rules";
import { MAX_PERSONALITIES, MAX_QUESTIONS, readPassportTest, type PassportTest } from "../lib/settings";
import { travelSet } from "../lib/travel-set";

/** D889: question pictures and characters are stored at most this long on their long side. */
const MAX_EDGE = 1600;

// This feature cannot import the activities feature (it imports us), so it builds its own paths.
const pageOf = (eventId: string, activityId: string) => `/admin/events/${eventId}/activities/${activityId}`;

async function testOf(eventId: string, activityId: string): Promise<{ ev: Event; activity: Activity; test: PassportTest; back: string }> {
  const { ev } = await requireEventAccess(eventId);
  const list = `/admin/events/${eventId}/activities`;
  await requireFeature(ev.id, featureForActivityKind("passport"), list);
  const activity = await getTestActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(list, "That passport no longer exists.", "error"));
  return { ev, activity, test: readPassportTest(activity.passport_test), back: pageOf(eventId, activityId) };
}

const refuse = (back: string, message: string): never => redirect(flashPath(back, message, "error"));

/**
 * Every write goes through here. D887: once guests have results, the parts their results came
 * from are fixed. D884: a test that is on must stay whole. Stale images go only after the row
 * naming their replacement is written.
 */
async function commit(ev: Event, activity: Activity, before: PassportTest, after: PassportTest, back: string, message: string, stale: (string | null)[] = []): Promise<never> {
  const locked = lockedChange(before, after, await countResults(activity.id));
  if (locked) refuse(back, locked);
  if (after.on) {
    const problems = testProblems(after);
    if (problems.length) refuse(back, problems[0]);
  }
  await saveTest(activity.id, ev.id, after);
  for (const url of stale) await deleteEventImage(url);
  revalidatePath(back);
  redirect(flashPath(back, message));
}

async function image(fd: FormData, name: string, current: string | null, ev: Event, kind: "passport-scene" | "passport-character" | "passport-crest", back: string): Promise<ImageChange> {
  try {
    // A built-in character (/passport/characters/…) is not ours to delete; deleteEventImage skips it.
    return await nextImage(fd, name, current, { orgId: ev.org_id, eventId: ev.id, kind, maxEdge: MAX_EDGE });
  } catch (e) {
    return refuse(back, (e as Error).message);
  }
}

const reader = (fd: FormData) => ({ get: (n: string) => String(fd.get(n) ?? ""), has: (n: string) => fd.get(n) !== null });

/** D881: the test on or off for this passport. On only when it is whole. */
export async function setTestOnAction(eventId: string, activityId: string, on: boolean) {
  const { ev, activity, test, back } = await testOf(eventId, activityId);
  await commit(ev, activity, test, { ...test, on }, back, on ? "Personality test on." : "Personality test off.");
}

/** D886: the ready-made travel set, replacing the questions and personalities. Its pictures ship in /public. */
export async function loadTravelSetAction(eventId: string, activityId: string) {
  const { ev, activity, test, back } = await testOf(eventId, activityId);
  const results = await countResults(activity.id);
  if (results > 0) refuse(back, `${results} ${results === 1 ? "guest has" : "guests have"} taken this test. Clear their results before loading the travel set.`);
  const set = travelSet();
  const stale = [...test.questions.map((q) => q.image), ...test.personalities.map((p) => p.picture)];
  await commit(ev, activity, test, { ...test, questions: set.questions, personalities: set.personalities, labels: set.labels }, back, "Travel set loaded.", stale);
}

/** D884: add (`questionId` "new") or edit one question, with its picture shrunk on upload (D889). */
export async function saveQuestionAction(eventId: string, activityId: string, questionId: string, fd: FormData) {
  const { ev, activity, test, back } = await testOf(eventId, activityId);
  const current = questionId === "new" ? null : test.questions.find((q) => q.id === questionId) ?? null;
  if (questionId !== "new" && !current) refuse(back, "That question no longer exists.");
  if (!current && test.questions.length >= MAX_QUESTIONS) refuse(back, `A personality test has at most ${MAX_QUESTIONS} questions.`);
  let q;
  try {
    q = readQuestionForm(reader(fd).get, current, test.personalities);
  } catch (e) {
    return refuse(back, (e as Error).message);
  }
  const pic = await image(fd, "image", current?.image ?? null, ev, "passport-scene", back);
  q.image = pic.url;
  const questions = current ? test.questions.map((x) => (x.id === q.id ? q : x)) : [...test.questions, q];
  await commit(ev, activity, test, { ...test, questions }, back, current ? "Question saved." : "Question added.", [pic.stale]);
}

export async function moveQuestionAction(eventId: string, activityId: string, questionId: string, dir: "up" | "down") {
  const { ev, activity, test, back } = await testOf(eventId, activityId);
  const i = test.questions.findIndex((q) => q.id === questionId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= test.questions.length) redirect(back);
  const questions = [...test.questions];
  [questions[i], questions[j]] = [questions[j], questions[i]];
  await commit(ev, activity, test, { ...test, questions }, back, "Question moved.");
}

export async function removeQuestionAction(eventId: string, activityId: string, questionId: string) {
  const { ev, activity, test, back } = await testOf(eventId, activityId);
  const gone = test.questions.find((q) => q.id === questionId);
  if (!gone) redirect(back);
  await commit(ev, activity, test, { ...test, questions: test.questions.filter((q) => q.id !== questionId) }, back, "Question removed.", [gone.image]);
}

/** D884: add or edit one personality, with its character picture shrunk on upload (D889). */
export async function savePersonalityAction(eventId: string, activityId: string, personalityId: string, fd: FormData) {
  const { ev, activity, test, back } = await testOf(eventId, activityId);
  const current = personalityId === "new" ? null : test.personalities.find((p) => p.id === personalityId) ?? null;
  if (personalityId !== "new" && !current) refuse(back, "That personality no longer exists.");
  if (!current && test.personalities.length >= MAX_PERSONALITIES) refuse(back, `A personality test has at most ${MAX_PERSONALITIES} personalities.`);
  const f = reader(fd);
  let p;
  try {
    p = readPersonalityForm(f.get, f.has, current);
  } catch (e) {
    return refuse(back, (e as Error).message);
  }
  if (test.personalities.some((x) => x.id !== p.id && x.name.toLowerCase() === p.name.toLowerCase())) refuse(back, `There is already a personality called ${p.name}.`);
  const pic = await image(fd, "picture", current?.picture ?? null, ev, "passport-character", back);
  p.picture = pic.url;
  const personalities = current ? test.personalities.map((x) => (x.id === p.id ? p : x)) : [...test.personalities, p];
  await commit(ev, activity, test, { ...test, personalities }, back, current ? "Personality saved." : "Personality added.", [pic.stale]);
}

/** Refused while any answer still points to it: the organiser points those elsewhere first. */
export async function removePersonalityAction(eventId: string, activityId: string, personalityId: string) {
  const { ev, activity, test, back } = await testOf(eventId, activityId);
  const gone = test.personalities.find((p) => p.id === personalityId);
  if (!gone) redirect(back);
  const pointing = test.questions.flatMap((q) => q.answers).filter((a) => a.personality === personalityId).length;
  if (pointing) refuse(back, `${pointing} answer${pointing === 1 ? " points" : "s point"} to ${gone.name}. Point ${pointing === 1 ? "it" : "them"} to another personality first.`);
  await commit(ev, activity, test, { ...test, personalities: test.personalities.filter((p) => p.id !== personalityId) }, back, "Personality removed.", [gone.picture]);
}

/** D876, D885: the holder page's labels, the cover's colour and its crest. */
export async function saveLookAction(eventId: string, activityId: string, fd: FormData) {
  const { ev, activity, test, back } = await testOf(eventId, activityId);
  const f = reader(fd);
  const look = readLookForm(f.get, f.has);
  const crest = await image(fd, "crest", test.cover.crest, ev, "passport-crest", back);
  await commit(ev, activity, test, { ...test, labels: look.labels, cover: { colour: look.colour, crest: crest.url } }, back, "Passport look saved.", [crest.stale]);
}
