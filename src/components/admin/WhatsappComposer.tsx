"use client";
import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import {
  SOURCES, defaultSources, fillVariables, sourceValue,
  type Source, type SourceValues, type Template,
} from "@/lib/whatsapp-templates";
import { sendKey } from "@/lib/whatsapp-targets";

const select = "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Pick an approved template, say what fills each `{{n}}`, and see the message as the first
 * person on the list will get it before anything goes out.
 *
 * The preview is filled from the same `sourceValue` the send uses, with a real attendee's name
 * and link, so what is on screen is what lands on the phone. Who it goes to is an audience
 * (whatsapp-targets.ts) - everyone, or who has or has not booked an activity - and the count
 * leaves out whoever already holds this send's claim key (`sendKey`), exactly as the send
 * will. Send again adds today's date to that key, so the same message can go out once more
 * each day.
 */
export function WhatsappComposer({ templates, initial, audiences, sentKeys, today, event, action }: {
  templates: Template[];
  initial: string;
  /** Each audience's reachable attendee ids, and one of them for the preview. */
  audiences: { key: string; label: string; ids: string[]; sample: { name: string; token: string } | null }[];
  /** The claim keys of every send that did not fail. */
  sentKeys: string[];
  today: string;
  event: Omit<SourceValues, "attendeeName">;
  action: (formData: FormData) => Promise<void>;
}) {
  const [name, setName] = useState(templates.some((t) => t.name === initial) ? initial : templates[0]?.name ?? "");
  const template = templates.find((t) => t.name === name) ?? null;
  const [sources, setSources] = useState<Source[]>(() => defaultSources(template?.variables ?? 0));
  const [custom, setCustom] = useState<string[]>([]);
  const [audienceKey, setAudienceKey] = useState(audiences[0]?.key ?? "all");
  const [again, setAgain] = useState(false);
  const had = useMemo(() => new Set(sentKeys), [sentKeys]);

  if (!template) {
    return (
      <div className="grid gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-base font-medium">Send a message</h2>
        <p className="text-sm text-muted-foreground">No approved template can be sent from here yet. Templates are created and approved in WhatsApp Manager.</p>
      </div>
    );
  }

  const pick = (next: string) => {
    const t = templates.find((x) => x.name === next);
    setName(next);
    setSources(defaultSources(t?.variables ?? 0));
    setCustom([]);
  };
  const audience = audiences.find((a) => a.key === audienceKey) ?? audiences[0];
  const sample = audience?.sample ?? null;
  const values: SourceValues = { attendeeName: sample?.name ?? "Attendee name", ...event };
  const filled = sources.map((src, i) => sourceValue(src, values, custom[i] ?? ""));
  const members = audience?.ids ?? [];
  const pending = members.filter((id) => !had.has(sendKey({ template: template.name, audience: audience.key, attendeeId: id, again, today }))).length;
  const sent = members.length - pending;
  const missingCustom = sources.some((src, i) => src === "custom" && !custom[i]?.trim());
  const missingVenue = sources.includes("venue") && !event.venue.trim();

  return (
    <form action={action} className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 xl:sticky xl:top-6">
      <h2 className="font-heading text-base font-medium">Send a message</h2>

      <label className="grid gap-1.5 text-sm font-medium">
        Template
        <select name="template" value={template.name} onChange={(e) => pick(e.target.value)} className={select}>
          {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </label>

      <label className="grid gap-1.5 text-sm font-medium">
        Send to
        <select name="audience" value={audience?.key} onChange={(e) => setAudienceKey(e.target.value)} className={select}>
          {audiences.map((a) => <option key={a.key} value={a.key}>{a.label} ({a.ids.length})</option>)}
        </select>
      </label>

      {template.variables > 0 && (
        <fieldset className="grid gap-3">
          <legend className="mb-1.5 text-sm font-medium">Fill in</legend>
          {sources.map((src, i) => (
            <div key={`${template.name}-${i}`} className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <code className="w-10 shrink-0 text-xs text-muted-foreground">{`{{${i + 1}}}`}</code>
                <select
                  name={`var_${i + 1}`} value={src} aria-label={`Variable ${i + 1}`} className={select}
                  onChange={(e) => setSources((prev) => prev.map((p, j) => (j === i ? e.target.value as Source : p)))}
                >
                  {(Object.keys(SOURCES) as Source[]).map((k) => <option key={k} value={k}>{SOURCES[k]}</option>)}
                </select>
              </div>
              {src === "custom" && (
                <input
                  name={`custom_${i + 1}`} value={custom[i] ?? ""} aria-label={`Text for variable ${i + 1}`}
                  placeholder="The same text for everybody"
                  onChange={(e) => setCustom((prev) => { const next = [...prev]; next[i] = e.target.value; return next; })}
                  className={`${select} ml-12 w-auto`}
                />
              )}
            </div>
          ))}
          {missingVenue && <p className="text-xs text-destructive">This event has no venue set. Add it in Settings, or choose something else.</p>}
        </fieldset>
      )}

      <div className="grid gap-1.5">
        <div className="text-sm font-medium">Preview{sample ? <span className="font-normal text-muted-foreground"> · as {sample.name} gets it</span> : null}</div>
        <Preview template={template} values={filled} token={sample?.token ?? "…"} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="again" checked={again} onChange={(e) => setAgain(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
        <span>
          <span className="font-medium">Send again</span>
          <span className="block text-xs text-muted-foreground">Also to people who already had it, once more today. For a reminder that goes out each day.</span>
        </span>
      </label>

      {pending === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {members.length === 0
            ? "Nobody in this audience has a usable number."
            : again ? "Everyone in this audience has already had it today." : "Everyone in this audience already has it. Tick Send again to send it once more."}
        </p>
      ) : (
        <ConfirmButton
          message={`Send ${template.name} to ${pending} attendee${pending === 1 ? "" : "s"} (${audience.label.toLowerCase()})? This cannot be recalled.`}
          tone="default" triggerVariant="default"
        >
          Send to {pending}
        </ConfirmButton>
      )}
      {(missingCustom || missingVenue) && pending > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground">Fill in every variable first; the send stops if one is empty.</p>
      )}
      <p className="text-xs text-muted-foreground">
        {sent > 0 ? `${sent} already ${sent === 1 ? "has" : "have"} it${again ? " today" : ""} and will be skipped. ` : ""}
        Safe to press twice: nobody gets the same send twice.
      </p>
    </form>
  );
}

/** The message as WhatsApp draws it: a bubble with header, body, footer and the link button. */
function Preview({ template, values, token }: { template: Template; values: string[]; token: string }) {
  return (
    <div className="rounded-xl bg-[#E7DED4] p-3 dark:bg-[#0B141A]">
      <div className="max-w-[20rem] overflow-hidden rounded-lg rounded-tl-none bg-white text-[13.5px] leading-snug text-[#111B21] shadow-sm dark:bg-[#202C33] dark:text-[#E9EDEF]">
        <div className="grid gap-1.5 px-3 pb-2 pt-2.5">
          {template.header && <div className="font-bold">{template.header}</div>}
          <p className="whitespace-pre-line break-words">{fillVariables(template.body, values)}</p>
          {template.footer && <div className="text-xs text-[#667781] dark:text-[#8696A0]">{template.footer}</div>}
        </div>
        {template.button && (
          <div className="border-t border-black/10 dark:border-white/10">
            <div className="flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-[#027EB5] dark:text-[#53BDEB]" title={`${template.button.urlPrefix}${token}`}>
              <ExternalLink aria-hidden className="size-4" />{template.button.text}
            </div>
          </div>
        )}
      </div>
      {template.button && (
        <div className="mt-2 truncate font-mono text-[11px] text-[#54656F] dark:text-[#8696A0]">Opens {template.button.urlPrefix}{token}</div>
      )}
    </div>
  );
}
