import type { BookFlow } from "./flow";
import type { PageKey } from "./pages";

/** How far a page bends mid-turn, in radians from hinge to free edge. */
const BEND = 0.9;

/**
 * D872: one page's shape mid-turn, as points along its length from the hinge (y, z in the leaf's
 * own frame: flat below the hinge at `f` 0, flat above it at 1). Paper, not a board: the angle
 * runs from the hinge's to a free edge that trails behind the way the page is moving (`dir` +1
 * turning up, -1 turning back). The bend is greatest mid-turn and gone at rest, and the page
 * keeps its length. Pure, so the shape is tested without a GPU.
 */
export function curlPoints(f: number, dir: 1 | -1, segments: number, length: number): { y: number; z: number }[] {
  const base = -Math.PI * f;
  const bend = BEND * Math.sin(Math.PI * f) * dir;
  const step = length / segments;
  const pts = [{ y: 0, z: 0 }];
  for (let i = 0; i < segments; i++) {
    const a = base + bend * ((i + 0.5) / segments);
    const p = pts[i];
    pts.push({ y: p.y - Math.cos(a) * step, z: p.z - Math.sin(a) * step });
  }
  return pts;
}

/**
 * D871, D872: the passport's leaves, top of the stack first. The cover (the intro's welcome page
 * inside it), the intro's Start page (question 1's scene on its back), then one leaf per question
 * (its question on the front, the next question's scene on the back), then the name page with the
 * stamp page on its back. The holder page is the block underneath, not a leaf.
 * Without a test (D881) the cover alone sits over the holder page, the stamps on its back.
 */
export function leafPages(testOn: boolean, questions: number): { front: PageKey; back: PageKey }[] {
  if (!testOn || questions === 0) return [{ front: "cover", back: "stamps" }];
  const out: { front: PageKey; back: PageKey }[] = [{ front: "cover", back: "welcome" }, { front: "intro", back: "scene:0" }];
  for (let i = 0; i < questions; i++) out.push({ front: `question:${i}`, back: i < questions - 1 ? `scene:${i + 1}` : "sign" });
  out.push({ front: "name", back: "stamps" });
  return out;
}

/** How many leaves are turned at this point in the passport, out of `leaves`. */
export function turnedLeaves(flow: BookFlow, leaves: number): number {
  switch (flow.stage) {
    case "locked":
    case "closed":
      return 0;
    case "intro":
      return 1;
    case "questions":
      return flow.index + 2;
    case "name":
      return leaves - 1;
    default:
      return leaves;
  }
}
