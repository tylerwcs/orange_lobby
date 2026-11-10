import type { Activity, Event } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { ImageField } from "@/components/admin/ImageField";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SaveBar } from "@/components/admin/SaveBar";
import { MAX_PERSONALITIES, MAX_QUESTIONS, MIN_PERSONALITIES, MIN_QUESTIONS, ANSWERS, TRAITS, readPassportTest, type PassportTest, type Personality, type TestQuestion } from "../lib/settings";
import { testProblems } from "../lib/rules";
import { coverColour } from "../lib/shades";
import {
  loadTravelSetAction, moveQuestionAction, removePersonalityAction, removeQuestionAction, saveLookAction,
  savePersonalityAction, saveQuestionAction, setTestOnAction,
} from "./actions";
import { TestRows } from "./TestRows";

const input = "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

/**
 * D884: the passport's "Personality test" section, in the admin style approved 25 Sep 2026:
 * header actions (the switch and the travel set), table-style lists with ⋯ menus, a sticky save
 * bar for the look. D887: once guests have results, answers' personalities, the list of
 * questions and removing personalities are locked, and the card says why.
 */
export function TestCard({ ev, activity, results }: { ev: Event; activity: Activity; results: number }) {
  const test = readPassportTest(activity.passport_test);
  const locked = results > 0;
  const lockNote = `${results} ${results === 1 ? "guest has" : "guests have"} taken this test`;
  const problems = testProblems(test);
  const usedBy = (p: Personality) => test.questions.flatMap((q) => q.answers).filter((a) => a.personality === p.id).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            Personality test
            <Badge variant={test.on ? "default" : "secondary"}>{test.on ? "On" : "Off"}</Badge>
          </CardTitle>
          <CardDescription>
            Guests answer one question per page, put their name on the passport, and see their personality on it before the stamps.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!locked && (
            <form action={loadTravelSetAction.bind(null, ev.id, activity.id)}>
              {test.questions.length || test.personalities.length
                ? <ConfirmButton message="Replace your questions and personalities with the travel set? Your labels are replaced too." confirmLabel="Use the travel set">Use the travel set</ConfirmButton>
                : <SubmitButton variant="outline">Use the travel set</SubmitButton>}
            </form>
          )}
          <form action={setTestOnAction.bind(null, ev.id, activity.id, !test.on)}>
            <SubmitButton variant={test.on ? "outline" : "default"}>{test.on ? "Turn off" : "Turn on"}</SubmitButton>
          </form>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {locked && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            <strong className="font-bold">{lockNote}.</strong> Which personality each answer points to and the list of questions are
            locked, and personalities can&apos;t be removed. Words, pictures, colours and traits can still change.
          </p>
        )}
        {!test.on && problems.length > 0 && (test.questions.length > 0 || test.personalities.length > 0) && (
          <p className="text-sm text-muted-foreground">Before it can go on: {problems[0]}</p>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold">Questions <span className="font-semibold text-muted-foreground tabular-nums">· {test.questions.length} of {MIN_QUESTIONS}–{MAX_QUESTIONS}</span></h3>
            {!locked && (test.questions.length < MAX_QUESTIONS
              ? (
                <Modal title="Add a question" hint={`Four answers, each pointing to a personality.`} trigger="Add question" icon="plus">
                  <QuestionForm ev={ev} activity={activity} test={test} q={null} locked={false} />
                </Modal>
              )
              : <Button variant="outline" size="sm" disabled>Add question</Button>)}
          </div>
          {test.questions.length === 0
            ? <p className="text-sm text-muted-foreground">No questions yet. Use the travel set, or add your own.</p>
            : (
              <TestRows
                noun="Question"
                move={locked ? null : moveQuestionAction.bind(null, ev.id, activity.id)}
                remove={removeQuestionAction.bind(null, ev.id, activity.id)}
                rows={test.questions.map((q) => ({
                  id: q.id,
                  title: q.text,
                  sub: q.scene || null,
                  thumb: q.image ? { src: q.image } : null,
                  form: <QuestionForm ev={ev} activity={activity} test={test} q={q} locked={locked} />,
                  blocked: locked ? `${lockNote}, so questions can't be removed.`
                    : test.on && test.questions.length <= MIN_QUESTIONS ? `A test that is on needs at least ${MIN_QUESTIONS} questions.` : undefined,
                }))}
              />
            )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold">Personalities <span className="font-semibold text-muted-foreground tabular-nums">· {test.personalities.length} of {MIN_PERSONALITIES}–{MAX_PERSONALITIES}</span></h3>
            {test.personalities.length < MAX_PERSONALITIES
              ? (
                <Modal title="Add a personality" hint="Its name, colour, character, six traits with three ticked, and its lines." trigger="Add personality" icon="plus">
                  <PersonalityForm ev={ev} activity={activity} test={test} p={null} />
                </Modal>
              )
              : <Button variant="outline" size="sm" disabled>Add personality</Button>}
          </div>
          {test.personalities.length === 0
            ? <p className="text-sm text-muted-foreground">No personalities yet.</p>
            : (
              <TestRows
                noun="Personality"
                move={null}
                remove={removePersonalityAction.bind(null, ev.id, activity.id)}
                rows={test.personalities.map((p) => {
                  const n = usedBy(p);
                  return {
                    id: p.id,
                    title: p.name,
                    sub: p.ticked.map((i) => p.traits[i]).filter(Boolean).join(" · ") || null,
                    thumb: p.picture ? { src: p.picture } : { colour: p.colour },
                    form: <PersonalityForm ev={ev} activity={activity} test={test} p={p} />,
                    blocked: locked ? `${lockNote}, so personalities can't be removed.`
                      : n > 0 ? `${n} answer${n === 1 ? " points" : "s point"} to it. Point ${n === 1 ? "it" : "them"} elsewhere first.`
                      : test.on && test.personalities.length <= MIN_PERSONALITIES ? `A test that is on needs at least ${MIN_PERSONALITIES} personalities.` : undefined,
                  };
                })}
              />
            )}
        </section>

        <section className="flex flex-col gap-3 border-t pt-5">
          <h3 className="text-sm font-extrabold">Passport look</h3>
          <form action={saveLookAction.bind(null, ev.id, activity.id)} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {test.labels.map((l, i) => (
                <Field key={i} label={`Holder page label ${i + 1}`} name={`label_${i}`} defaultValue={l} />
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Cover colour</span>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="cover_theme" defaultChecked={test.cover.colour === null} className="size-4 accent-primary" />
                Use the event&apos;s colour
              </label>
              <input type="color" name="cover_colour" aria-label="Cover colour" defaultValue={coverColour(test, ev.primary_color)} className="h-9 w-20 cursor-pointer rounded-md border border-input bg-transparent p-1" />
              <p className="text-xs text-muted-foreground">Darkened if needed so the gold lettering reads.</p>
            </div>
            <ImageField label="Crest (optional)" name="crest" url={test.cover.crest} description="Replaces the globe on the cover. A transparent PNG in one light colour works best." />
            <SaveBar inCard />
          </form>
        </section>
      </CardContent>
    </Card>
  );
}

function QuestionForm({ ev, activity, test, q, locked }: { ev: Event; activity: Activity; test: PassportTest; q: TestQuestion | null; locked: boolean }) {
  return (
    <form action={saveQuestionAction.bind(null, ev.id, activity.id, q?.id ?? "new")} className="grid gap-4 p-1">
      <Field label="Scene (optional)" name="scene" defaultValue={q?.scene} placeholder="Boarding" description="Shown small above the picture." />
      <Field label="Question" name="text" defaultValue={q?.text} placeholder="Which seat are you taking?" />
      <ImageField label="Picture (optional)" name="image" url={q?.image} description="A photo or an illustration, landscape (about 3:2). Cropped to fill; stored at most 1600 px wide." />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-bold">Answers</legend>
        {test.personalities.length === 0 && <p className="text-sm text-muted-foreground">Add the personalities first: each answer points to one.</p>}
        {Array.from({ length: ANSWERS }, (_, j) => {
          const a = q?.answers[j];
          return (
            <div key={j} className="grid grid-cols-[3.5rem_1fr] gap-2 sm:grid-cols-[3.5rem_1fr_11rem]">
              <input name={`icon_${j}`} aria-label={`Answer ${j + 1} icon (optional)`} defaultValue={a?.icon ?? ""} placeholder="🙂" maxLength={8} className={`${input} text-center`} />
              <input name={`answer_${j}`} aria-label={`Answer ${j + 1}`} defaultValue={a?.text ?? ""} placeholder={`Answer ${j + 1}`} className={input} />
              <select name={`who_${j}`} aria-label={`Answer ${j + 1} points to`} defaultValue={a?.personality ?? ""} disabled={locked} className={`${input} col-span-2 sm:col-span-1`}>
                <option value="" disabled>Points to…</option>
                {test.personalities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          );
        })}
        {locked && <p className="text-xs text-muted-foreground">Guests have taken this test, so which personality each answer points to is locked.</p>}
      </fieldset>
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}

function PersonalityForm({ ev, activity, test, p }: { ev: Event; activity: Activity; test: PassportTest; p: Personality | null }) {
  return (
    <form action={savePersonalityAction.bind(null, ev.id, activity.id, p?.id ?? "new")} className="grid gap-4 p-1">
      <Field label="Name" name="name" defaultValue={p?.name} placeholder="TRAILBLAZER" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`colour-${p?.id ?? "new"}`} className="text-sm font-bold">Colour</label>
        <input id={`colour-${p?.id ?? "new"}`} type="color" name="colour" defaultValue={p?.colour ?? "#3E7BD9"} className="h-9 w-20 cursor-pointer rounded-md border border-input bg-transparent p-1" />
      </div>
      <ImageField label="Character picture (optional)" name="picture" url={p?.picture} description="Portrait (about 5:6). Without one, the page shows the name's first letter." />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-bold">{test.labels[0]} <span className="font-normal text-muted-foreground">· {TRAITS} traits, tick 3</span></legend>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: TRAITS }, (_, j) => (
            <div key={j} className="flex items-center gap-2">
              <input type="checkbox" name={`tick_${j}`} aria-label={`Tick trait ${j + 1}`} defaultChecked={p?.ticked.includes(j) ?? false} className="size-4 shrink-0 accent-primary" />
              <input name={`trait_${j}`} aria-label={`Trait ${j + 1}`} defaultValue={p?.traits[j] ?? ""} placeholder={`Trait ${j + 1}`} className={input} />
            </div>
          ))}
        </div>
      </fieldset>
      <Field label={sentence(test.labels[1])} name="style" defaultValue={p?.style} placeholder="Exit row, then wing it" />
      <div className="grid gap-2">
        <Field label={`${sentence(test.labels[2])} (line 1)`} name="say_0" defaultValue={p?.say[0]} placeholder="“Let's just go, we'll" />
        <Field label={`${sentence(test.labels[2])} (line 2)`} name="say_1" defaultValue={p?.say[1]} placeholder="figure it out there.”" />
      </div>
      <Field label="One line about them (optional)" name="blurb" defaultValue={p?.blurb} description="For you here in admin." />
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}

/** "TRAVEL STYLE" → "Travel style", for a form label. */
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
