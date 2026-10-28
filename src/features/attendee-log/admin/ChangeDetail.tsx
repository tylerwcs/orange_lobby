import { Modal } from "@/components/admin/Modal";
import type { AttendeeChange } from "../types";
import { VERB } from "../lib/kinds";
import { Delta } from "./Delta";

/** A bulk change can touch thousands of people; the dialog shows this many and says how many it left out. */
const MAX_PEOPLE = 200;

/**
 * D746: what a change did, for each person it touched. An edit reads as `label: before → after`;
 * a delete or an import that added someone shows them as they were, as a read-only field list.
 */
export function ChangeDetail({ change }: { change: AttendeeChange }) {
  const shown = change.people.slice(0, MAX_PEOPLE);
  const more = change.people.length - shown.length;
  return (
    <Modal title={VERB[change.kind]} hint={change.summary} trigger="View" variant="outline">
      <div className="grid gap-4">
        {shown.map((p, i) => (
          <section key={`${p.attendeeId}:${i}`} className="rounded-lg border p-3">
            <div className="font-bold">{p.name || "(no name)"}</div>
            {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
            {p.fields && p.fields.length > 0 && (
              <ul className="mt-2 grid gap-1 text-sm">
                {p.fields.map((f, j) => (
                  <li key={j}>
                    <span className="font-semibold">{f.label}:</span>{" "}
                    <Delta before={f.before} after={f.after} />
                  </li>
                ))}
              </ul>
            )}
            {p.snapshot && p.snapshot.length > 0 && (
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                {p.snapshot.map((f, j) => (
                  <div key={j} className="contents">
                    <dt className="font-semibold">{f.label}</dt>
                    <dd className="break-words text-muted-foreground">{f.value || "(blank)"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
        {more > 0 && <p className="text-sm text-muted-foreground">and {more} more</p>}
      </div>
    </Modal>
  );
}
