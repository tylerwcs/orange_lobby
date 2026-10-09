import { readPassportSettings } from "@/lib/booths";
import { parseCategories } from "@/lib/agenda";
import { cleanRichText } from "@/lib/rich-text";
import type { NewActivity } from "@/lib/db/activities";
import { categoryValues, type FormReader } from "../form";

export type PassportSettings = {
  name: string;
  description: string | null;
  categories: string[] | null;
  stamps_required: number | null;
  reward_message: string | null;
};

/**
 * A passport's Setup form and its add form (D420). No `required` and no cap (D183): a passport
 * is never owed and every booth stamps once. `boothCount` is null while it is being created and
 * has no booths to bound the target by.
 */
export function readPassportSettingsForm(form: FormReader, boothCount: number | null): PassportSettings {
  const name = form.text("name");
  if (!name) throw new Error("A passport needs a name");
  return {
    name,
    description: cleanRichText(form.text("description")),
    categories: parseCategories(categoryValues(form)),
    ...readPassportSettings({ stamps_required: form.text("stamps_required"), reward_message: form.text("reward_message") }, boothCount),
  };
}

export function newPassport(settings: PassportSettings, isOpen: boolean): NewActivity {
  return { ...settings, kind: "passport", required: false, is_open: isOpen, max_per_attendee: null, questions: [], per_day: false };
}
