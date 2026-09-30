import type { DisplayDraw, DisplayState, Person } from "@/lib/games/wire";
import type { Phase } from "@/lib/games/phase";
import { DEFAULT_BACKGROUND } from "@/lib/games/background";
import { tag } from "@/lib/games/names";

const NAMES = [
  "Ann Lee", "Ben Tan", "Cai Wong", "Dev Raj", "Eve Lim", "Farah Aziz", "Gopal Nair", "Hana Ito",
  "Ivan Koh", "Jia Hui Ong", "Kumar Das", "Lina Chua", "Mei Ling Tan", "Nik Hassan", "Omar Said",
  "Priya Rama", "Qi Wei", "Rosa Diaz", "Sam Yeo", "Tara Singh", "Uma Devi", "Victor Lau", "Wen Jie", "Yusof Ali",
];
const PEOPLE: Person[] = NAMES.map((n, i) => ({ id: `test-${i}`, ...tag({ name: n }) }));

export const TEST_STEPS = 4;

/**
 * The display self-test (D296), for the AV laptop before the show: a slot spin, a wheel spin, a
 * card flip and a winner, from built-in names, looping. It never reads or writes the stage. `at`
 * is when step `i` starts; its spin ends relative to it.
 */
export function testStep(i: number, event: DisplayState["event"], at: number): { state: DisplayState; holdMs: number } {
  const n = ((i % TEST_STEPS) + TEST_STEPS) % TEST_STEPS;
  const stage = (phase: Phase, endsAt: number | null = null): DisplayState["stage"] => ({
    key: `test:${i}`, phase, endsAt, game: { id: "test", kind: "draw", title: "Display test", green: false },
    race: null, question: null, reveal: null, prizeNo: 0,
  });
  const draw = (over: Partial<DisplayDraw>): DisplayDraw => ({
    format: "slot", prize: "Grand prize", prizeImage: null, pool: PEOPLE.length, sample: PEOPLE, targets: null, spinMs: null,
    quick: false, wheel: null, mosaic: null, cardBack: null, cards: null, winners: null, ...over,
  });
  const base = { now: at, event, look: DEFAULT_BACKGROUND, race: null, survival: null };
  if (n === 0) return { holdMs: 7000, state: { ...base, stage: stage("draw_spinning", at + 5000), draw: draw({ targets: [PEOPLE[0]], spinMs: 5000 }) } };
  if (n === 1) {
    return { holdMs: 8500, state: { ...base, stage: stage("draw_spinning", at + 6000), draw: draw({ format: "wheel", wheel: PEOPLE, targets: [PEOPLE[7]], spinMs: 6000 }) } };
  }
  if (n === 2) {
    const slots = Array.from({ length: 10 }, (_, k) => (k === 3
      ? { no: 4, taken: true, prize: "Grand prize", image: null, winner: "Ann Lee" }
      : { no: k + 1, taken: false, prize: null, image: null, winner: null }));
    return { holdMs: 5000, state: { ...base, stage: stage("draw_card_reveal"), draw: draw({ format: "cards", prize: null, cards: { slots, participant: { name: "Ann Lee", company: "Ecopia" }, picked: 4 } }) } };
  }
  return { holdMs: 5000, state: { ...base, stage: stage("draw_reveal"), draw: draw({ winners: [{ name: "Ann Lee", company: "Ecopia" }] }) } };
}
