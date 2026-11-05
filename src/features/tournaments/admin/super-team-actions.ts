"use server";
import { redirect } from "next/navigation";
import { flashPath } from "@/lib/flash";
import { listGroups } from "@/lib/db/groups";
import { done, formOf, tabPath, tournament } from "./guard";
import { anyDrawn, deleteSuperTeam, listSuperTeams, saveSuperTeam, setSuperTeamsOn } from "../db/super-teams";
import { pairProblem } from "../lib/sides";

/**
 * D821-D823: the organiser's super team writes, on the Sports tab. The switch and the pairs are
 * fixed once any sport has been drawn: pools and matches point at each pair's lead group.
 */

const DRAWN = "Super teams can't change once a sport has been drawn. Reset its matches first.";

async function open(eventId: string, activityId: string) {
  const { cup } = await tournament(eventId, activityId);
  const back = tabPath(eventId, cup.id, "sports");
  if (await anyDrawn(cup.id)) redirect(flashPath(back, DRAWN, "error"));
  return { cup, back };
}

export async function setSuperTeamsAction(eventId: string, activityId: string, fd: FormData) {
  const { cup, back } = await open(eventId, activityId);
  const on = formOf(fd).checked("super_teams");
  await setSuperTeamsOn(cup.id, on);
  done(eventId, cup.id, back, on ? "Super teams on." : "Super teams off.");
}

export async function saveSuperTeamAction(eventId: string, activityId: string, superTeamId: string | null, fd: FormData) {
  const { cup, back } = await open(eventId, activityId);
  const form = formOf(fd);
  const groups = await listGroups(cup.event_id);
  const names = new Map(groups.map((g) => [g.id, g.name]));
  const picked = [form.text("group_a"), form.text("group_b")];
  if (picked.some((g) => !names.has(g))) redirect(flashPath(back, "Pick two different teams.", "error"));
  const problem = pairProblem(await listSuperTeams(cup.id), picked, superTeamId);
  if (typeof problem === "string") redirect(flashPath(back, problem, "error"));
  const taken = (id: string) => `${names.get(id) ?? "That team"} is already in a super team.`;
  if (problem) redirect(flashPath(back, taken(problem.clash), "error"));
  const r = await saveSuperTeam(cup, { id: superTeamId, name: form.text("name") || null, groupIds: [picked[0], picked[1]] });
  // Another admin paired one of them in the meantime.
  if (r === "taken") redirect(flashPath(back, "One of those teams is already in a super team.", "error"));
  done(eventId, cup.id, back, "Super team saved.");
}

export async function deleteSuperTeamAction(eventId: string, activityId: string, superTeamId: string) {
  const { cup, back } = await open(eventId, activityId);
  await deleteSuperTeam(cup.id, superTeamId);
  done(eventId, cup.id, back, "Super team removed.");
}
