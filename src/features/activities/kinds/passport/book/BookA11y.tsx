"use client";
import type { PassportTest, Personality } from "@/features/passport-test/client";
import type { BookFlow } from "./flow";

/**
 * Goal 21: the passport's words as real elements, out of sight. Screen readers and keyboards use
 * the test through these; each does exactly what the matching tap on a page does. The name field
 * itself is the visible input over the name page, so it is not repeated here.
 */
export function BookA11y({ flow, test, personality, holderName, stamps, onOpen, onStart, onPick, onBack, onFinish, saving }: {
  flow: BookFlow;
  test: PassportTest;
  personality: Personality | null;
  holderName: string;
  stamps: number;
  onOpen: () => void;
  onStart: () => void;
  onPick: (answerId: string) => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
}) {
  const q = flow.stage === "questions" ? test.questions[flow.index] : null;
  return (
    <div className="sr-only" aria-live="polite">
      {flow.stage === "closed" && <button type="button" onClick={onOpen}>Open your passport</button>}
      {flow.stage === "locked" && <p>{flow.closedMessage}</p>}
      {flow.stage === "intro" && (
        <>
          <h2>{test.intro.heading}</h2>
          <p>{`${test.intro.line} ${test.questions.length} questions.`}</p>
          <button type="button" onClick={onStart}>Start</button>
        </>
      )}
      {q && (
        <>
          <h2>{`Question ${flow.index + 1} of ${test.questions.length}: ${q.text}`}</h2>
          {q.answers.map((a) => (
            <button key={a.id} type="button" aria-pressed={flow.picks[flow.index] === a.id} onClick={() => onPick(a.id)}>{a.text}</button>
          ))}
          <button type="button" onClick={onBack}>{flow.index === 0 ? "Back to the start" : "Previous question"}</button>
        </>
      )}
      {flow.stage === "name" && (
        <>
          <button type="button" onClick={onBack}>Previous question</button>
          <button type="button" disabled={saving} onClick={onFinish}>That&apos;s me</button>
        </>
      )}
      {(flow.stage === "revealing" || flow.stage === "done") && (
        <p>
          {personality ? `You're a ${personality.name}. ` : ""}
          {`Passport holder: ${holderName}. `}
          {personality ? `${test.labels[0]}: ${personality.ticked.map((i) => personality.traits[i]).filter(Boolean).join(", ")}. ` : ""}
          {personality ? `${test.labels[1]}: ${personality.style}. ${test.labels[2]}: ${personality.say.join(" ")} ` : ""}
          {`${stamps} stamp${stamps === 1 ? "" : "s"} on your passport.`}
        </p>
      )}
    </div>
  );
}
