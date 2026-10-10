"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { basicsComplete, basicsErrors, BASICS_LABELS, type BasicsAnswers, type BasicsField } from "../sections/basics";
import type { SectionStatus } from "../status";
import { HomePreview, type PreviewSlot } from "../preview/HomePreview";
import { SetupImageField } from "./SetupImageField";
import { StepFrame, StepGroup } from "./StepFrame";
import { useSectionAutosave } from "./useSectionAutosave";

const SLOT_OF: Partial<Record<BasicsField, PreviewSlot>> = {
  name: "header", starts_on: "header", ends_on: "header", venue_name: "header",
  primary_color: "colour", logo_url: "logo", banner_url: "banner",
};
const FIELD_OF: Record<PreviewSlot, BasicsField> = { header: "name", logo: "logo_url", banner: "banner_url", colour: "primary_color" };

/**
 * Event basics (D446): short groups with a line of help each, next to the portal home they shape
 * (D445). Saving and submitting are the shared step machinery's (D460).
 */
export function BasicsStep({ token, initial, initialRev, initialStatus, initialUnsubmitted }: {
  token: string;
  initial: BasicsAnswers;
  initialRev: number;
  initialStatus: SectionStatus;
  initialUnsubmitted: boolean;
}) {
  const step = useSectionAutosave({ token, section: "basics", initial, initialRev, initialStatus, initialUnsubmitted });
  const { answers: a, setAnswers: setA } = step;
  const [focused, setFocused] = useState<PreviewSlot | null>(null);
  const errors = basicsErrors(a);

  const set = (f: BasicsField) => (v: string) => setA((p) => ({ ...p, [f]: v }));
  const focus = (f: BasicsField) => () => setFocused(SLOT_OF[f] ?? null);
  const jump = (slot: PreviewSlot) => {
    setFocused(slot);
    document.querySelector<HTMLElement>(`[data-setup-field="${FIELD_OF[slot]}"]`)?.focus();
  };

  const text = (f: BasicsField, type = "text", placeholder = "") => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{BASICS_LABELS[f]}</span>
      <Input type={type} value={a[f]} placeholder={placeholder} data-setup-field={f} onFocus={focus(f)} onChange={(e) => set(f)(e.target.value)}
        aria-invalid={errors[f] ? true : undefined} className={type === "date" ? "w-44" : ""} />
      {errors[f] && <span className="text-xs font-semibold text-destructive">{errors[f]}</span>}
    </label>
  );
  const area = (f: BasicsField, placeholder: string, rows = 3) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{BASICS_LABELS[f]}</span>
      <Textarea value={a[f]} rows={rows} placeholder={placeholder} data-setup-field={f} onFocus={focus(f)} onChange={(e) => set(f)(e.target.value)}
        aria-invalid={errors[f] ? true : undefined} />
      {errors[f] && <span className="text-xs font-semibold text-destructive">{errors[f]}</span>}
    </label>
  );

  return (
    <StepFrame token={token} title="Event basics" step={step} complete={basicsComplete(a)}
      preview={<HomePreview basics={a} focused={focused} onSlot={jump} />}>
      <StepGroup title="Your event" help="Shown at the top of the portal and in WhatsApp messages. All times are Malaysia time.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("name", "text", "Ecopia Kick-Off Meeting 2027")}</div>
          {text("starts_on", "date")}
          {text("ends_on", "date")}
          <div className="sm:col-span-2">{text("venue_name", "text", "Sunway Pyramid Convention Centre")}</div>
        </div>
      </StepGroup>

      <StepGroup title="How it looks" help="Send each image at about twice its on-screen size so it stays sharp on phones.">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{BASICS_LABELS.primary_color}</span>
            <span className="flex items-center gap-2">
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(a.primary_color) ? a.primary_color : "#F97316"} onFocus={focus("primary_color")}
                onChange={(e) => set("primary_color")(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border border-input" aria-label="Pick a colour" />
              <Input value={a.primary_color} data-setup-field="primary_color" onFocus={focus("primary_color")} onChange={(e) => set("primary_color")(e.target.value)} className="w-28 font-mono" />
            </span>
            {errors.primary_color && <span className="text-xs font-semibold text-destructive">{errors.primary_color}</span>}
          </label>
          <SetupImageField token={token} kind="logo" label={BASICS_LABELS.logo_url} value={a.logo_url} onChange={set("logo_url")} onFocus={focus("logo_url")} />
          <SetupImageField token={token} kind="banner" label={BASICS_LABELS.banner_url} value={a.banner_url} onChange={set("banner_url")} onFocus={focus("banner_url")} />
        </div>
      </StepGroup>

      <StepGroup title="People" help="Categories decide who sees what. The committee numbers get WhatsApp alerts when attendees ask to change a booking.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{area("categories", "One per line, e.g.\nStaff\nVendor\nVIP")}</div>
          <div className="sm:col-span-2">{area("committee_numbers", "One per line, e.g.\n012-345 6789")}</div>
        </div>
      </StepGroup>

      <StepGroup title="Anything else" help="Anything we should know that isn't asked above.">{area("notes", "", 4)}</StepGroup>
    </StepFrame>
  );
}
