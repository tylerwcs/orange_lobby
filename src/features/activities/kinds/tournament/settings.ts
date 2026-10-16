import { parseCategories } from "@/lib/agenda";
import { cleanRichText } from "@/lib/rich-text";
import type { NewActivity } from "../../db/activities";
import { scheduleAt } from "../../lib/schedule";
import { categoryValues, type FormReader } from "../form";
import { readPlacePoints } from "@/features/tournaments/client";

export type TournamentKindSettings = {
  name: string;
  description: string | null;
  categories: string[] | null;
  /** D641: when squads lock for the portal. Required. */
  squads_close_at: string;
  /** D640. */
  squad_fill: "captains" | "self";
  /** D640: the fields whose Yes makes a member a picker, as D392's. */
  proxy_fields: string[];
  /** D654: points per place, 1st first; null is no overall leaderboard. */
  place_points: number[] | null;
};

/** A tournament's add form and its Setup card (D420, D640, D641). Its sports save on their own tab. */
export function readTournamentKindSettings(form: FormReader): TournamentKindSettings {
  const name = form.text("name");
  if (!name) throw new Error("A tournament needs a name");
  const squads_close_at = scheduleAt(form.text("close_date"), form.text("close_time"));
  if (!squads_close_at) throw new Error("Set the squad deadline");
  return {
    name,
    description: cleanRichText(form.text("description")),
    categories: parseCategories(categoryValues(form)),
    squads_close_at,
    squad_fill: form.text("squad_fill") === "self" ? "self" : "captains",
    // As the submission reader: field keys, as ticked, once each.
    proxy_fields: [...new Set(form.all("proxy_fields").map((v) => v.trim()).filter(Boolean))].slice(0, 10),
    place_points: readPlacePoints(form.text("place_points")),
  };
}

/** Never owed and never capped: a squad place is the captain's to give, not a cap to count (D637). */
export function newTournament(settings: TournamentKindSettings, isOpen: boolean): NewActivity {
  return { ...settings, kind: "tournament", required: false, is_open: isOpen, max_per_attendee: null, questions: [], per_day: false };
}
