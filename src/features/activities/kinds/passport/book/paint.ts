import { personalityShades, type PassportTest, type Personality, type TestQuestion } from "@/features/passport-test/client";
import { PAPER, PAPER_INK, STAMP_ART_FILTER } from "../paper";
import { fitText } from "./fit";
import { answerBox, LABEL_Y, MARGIN, NAME_BUTTON, NAME_FIELD, PAGE, SCENE_FRAME, START_BUTTON } from "./geometry";
import { stampSpot } from "./stamp-spots";

/**
 * The passport's pages, painted on 2D canvases (sketch v3, approved 9 Nov). The 3D book wraps
 * them as textures and the flat book shows them as they are, so both always match. Landscape
 * pages are PAGE (1024 × 720); the cover is portrait (720 × 1024). Browser only, except
 * `sceneArt`, which is pure.
 */

/** The three faces, as `next/font` names them (`font.style.fontFamily`); passed in so this file stays free of next/font. */
export type Fonts = { display: string; body: string; hand: string };
export type Ctx = CanvasRenderingContext2D;

export const COVER_SIZE = { w: 720, h: 1024 } as const;
const GOLD = "#E2BE68";
const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const INK = "#2A1E10";
const PICKED = "#2E7D46";

/** D873: the panels a question shows with no picture, one per page in turn. */
export const SCENE_TINTS = ["#DCE7F2", "#E6E0F3", "#D9ECEF", "#F2E6D6", "#E3EEDC", "#F3E0E4", "#F2EBD3", "#F5DDD3", "#DCDDF2", "#E0EEE8"];

/**
 * D873: what the top page shows - the organiser's picture once it has actually loaded, else a
 * plain tinted panel with the first answer's icon. Never a broken-image frame.
 */
export function sceneArt(q: TestQuestion, index: number, img: HTMLImageElement | null):
  { kind: "image"; img: HTMLImageElement } | { kind: "panel"; tint: string; emoji: string } {
  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) return { kind: "image", img };
  return { kind: "panel", tint: SCENE_TINTS[index % SCENE_TINTS.length], emoji: q.answers.find((a) => a.icon)?.icon ?? "✈️" };
}

// ---------- shared marks ----------

const font = (weight: number | string, size: number, family: string) => `${weight} ${size}px ${family}`;

function fit(ctx: Ctx, text: string, maxWidth: number, weight: number | string, family: string, sizes: { max: number; min: number }, maxLines = 1) {
  const r = fitText(text, maxWidth, sizes, (t, size) => { ctx.font = font(weight, size, family); return ctx.measureText(t).width; }, maxLines);
  ctx.font = font(weight, r.size, family);
  return r;
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function spaced(ctx: Ctx, px: number) {
  // letterSpacing is missing on older Safari: the text is just tighter there.
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

/** The cream sheet with its faint wavy security lines (D854's paper, drawn). */
function paper(ctx: Ctx, w: number = PAGE.w, h: number = PAGE.h) {
  const g = ctx.createRadialGradient(w / 2, h * 0.4, 40, w / 2, h * 0.45, w * 0.8);
  g.addColorStop(0, PAPER.centre); g.addColorStop(0.7, PAPER.mid); g.addColorStop(1, PAPER.edge);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(160,122,69,.10)"; ctx.lineWidth = 1.2;
  for (let y = 14; y < h; y += 18) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin(x / 22) * 4);
    ctx.stroke();
  }
}

/** The shadow along the spine. `atTop`: the bottom page (spine above it); otherwise the top page. */
function hinge(ctx: Ctx, atTop: boolean) {
  const y0 = atTop ? 0 : PAGE.h, y1 = atTop ? 34 : PAGE.h - 34;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "rgba(90,60,20,.22)"); g.addColorStop(1, "rgba(90,60,20,0)");
  ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), PAGE.w, 34);
}

function label(ctx: Ctx, text: string, x: number, y: number, align: CanvasTextAlign, f: Fonts, colour: string = PAPER_INK.label) {
  ctx.fillStyle = colour; ctx.font = font(700, 22, f.body); spaced(ctx, 5);
  ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(text, x, y); spaced(ctx, 0);
}

function tick(ctx: Ctx, x: number, y: number, s: number, colour: string) {
  ctx.save(); ctx.strokeStyle = colour; ctx.lineWidth = 8 * s; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(x + 4 * s, y - 2 * s); ctx.lineTo(x + 16 * s, y + 14 * s); ctx.lineTo(x + 46 * s, y - 34 * s); ctx.stroke();
  ctx.restore();
}

function pill(ctx: Ctx, x: number, y: number, text: string, bg: string, fg: string, f: Fonts) {
  ctx.font = font(400, 26, f.display);
  const w = Math.min(ctx.measureText(text).width + 48, 560);
  ctx.fillStyle = bg; rr(ctx, x, y, w, 50, 25); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, x + 24, y + 26, w - 48);
}

function dashed(ctx: Ctx, x1: number, x2: number, y: number, colour: string) {
  ctx.save(); ctx.strokeStyle = colour; ctx.lineWidth = 3; ctx.setLineDash([16, 12]);
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); ctx.restore();
}

/** An image scaled to cover a box, centred, clipped by the caller. */
function cover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// ---------- pages ----------

/**
 * The cover's surface for the 3D book, painted to the same layout as `paintCover`: red is height
 * (the leather's grain, the spine's crease, the gold stamped up out of it), green is roughness
 * and blue is metal - three.js reads its bump, roughness and metalness maps from those channels.
 * So the gold foil is raised, smooth and metal, and catches the light; the leather is matt.
 */
const SURFACE = { leather: "rgb(120,235,0)", gold: "rgb(255,80,255)", printed: "rgb(225,200,0)", crease: "rgb(40,245,0)" };

/** D871, D885: the closed portrait cover - the event's name, PASSPORT in gold, the crest (the organiser's, or the globe). `surface`: its relief instead (above). */
export function paintCover(ctx: Ctx, o: { colour: string; crest: HTMLImageElement | null; eventName: string; fonts: Fonts; surface?: boolean }) {
  const { w, h } = COVER_SIZE;
  const S = !!o.surface;
  ctx.fillStyle = S ? SURFACE.leather : o.colour; ctx.fillRect(0, 0, w, h);
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // The leather's grain: specks of light and shade, or bumps and dips.
  for (let i = 0; i < 9000; i++) {
    const up = r() > 0.5;
    ctx.fillStyle = S ? (up ? "rgb(160,245,0)" : "rgb(80,222,0)") : up ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.08)";
    const s = 2 + Math.floor(r() * 2);
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  if (!S) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "rgba(255,255,255,.08)"); g.addColorStop(1, "rgba(0,0,0,.2)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  // The crease where the cover bends at the spine (left), pressed in.
  if (S) { ctx.fillStyle = SURFACE.crease; ctx.fillRect(40, 0, 10, h); }
  else {
    ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(40, 0, 6, h);
    ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.fillRect(48, 0, 4, h);
  }

  const ink = S ? SURFACE.gold : GOLD;
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  spaced(ctx, 8);
  fit(ctx, o.eventName.toUpperCase(), w - 120, 600, o.fonts.body, { max: 26, min: 16 });
  ctx.fillText(o.eventName.toUpperCase(), w / 2, 130, w - 100);
  spaced(ctx, 14); ctx.font = font(400, 64, o.fonts.display); ctx.fillText("PASSPORT", w / 2 + 7, 220); spaced(ctx, 0);

  const cx = w / 2, cy = 510;
  if (o.crest && o.crest.naturalWidth > 0) {
    const s = Math.min(300 / o.crest.naturalWidth, 300 / o.crest.naturalHeight);
    const cw = o.crest.naturalWidth * s, ch = o.crest.naturalHeight * s;
    if (!S) ctx.drawImage(o.crest, cx - cw / 2, cy - ch / 2, cw, ch);
    else {
      // The organiser's crest is printed, not foil: raised a little where it has ink, never metal.
      const off = document.createElement("canvas"); off.width = Math.ceil(cw); off.height = Math.ceil(ch);
      const ox = off.getContext("2d");
      if (ox) {
        ox.drawImage(o.crest, 0, 0, cw, ch);
        ox.globalCompositeOperation = "source-in"; ox.fillStyle = SURFACE.printed; ox.fillRect(0, 0, off.width, off.height);
        ctx.drawImage(off, cx - cw / 2, cy - ch / 2);
      }
    }
  } else {
    ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(cx, cy, 130, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 104, 0, Math.PI * 2); ctx.stroke();
    for (const rx of [104, 66, 28]) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, 104, 0, 0, Math.PI * 2); ctx.stroke(); }
    for (const dy of [-60, 0, 60]) { const hw = Math.sqrt(104 * 104 - dy * dy); ctx.beginPath(); ctx.moveTo(cx - hw, cy + dy); ctx.lineTo(cx + hw, cy + dy); ctx.stroke(); }
    for (let i = 0; i < 14; i++) {
      for (const side of [-1, 1]) {
        const a = Math.PI / 2 + side * (0.35 + i * 0.17);
        ctx.save(); ctx.translate(cx + Math.cos(a) * 160, cy + Math.sin(a) * 160); ctx.rotate(a + side * 0.6);
        ctx.beginPath(); ctx.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
  }
  spaced(ctx, 6); ctx.font = font(600, 24, o.fonts.body); ctx.fillText("EVENT PASSPORT", w / 2, 800); spaced(ctx, 0);
  ctx.lineWidth = 4; rr(ctx, cx - 34, 880, 68, 44, 6); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, 902, 10, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 34, 902); ctx.lineTo(cx - 10, 902); ctx.moveTo(cx + 10, 902); ctx.lineTo(cx + 34, 902); ctx.stroke();
}

/** D873: the top page of a question's spread - its picture (or the panel), "PAGE 0N" and the scene's name. */
export function paintScene(ctx: Ctx, o: { q: TestQuestion; index: number; img: HTMLImageElement | null; fonts: Fonts }) {
  const F = SCENE_FRAME;
  paper(ctx);
  label(ctx, `PAGE ${String(o.index + 1).padStart(2, "0")}`, F.x + 6, LABEL_Y, "left", o.fonts, PAPER_INK.name);
  if (o.q.scene) label(ctx, o.q.scene.toUpperCase(), F.x + F.w - 6, LABEL_Y, "right", o.fonts, PAPER_INK.name);
  const art = sceneArt(o.q, o.index, o.img);
  ctx.save(); rr(ctx, F.x, F.y, F.w, F.h, 22); ctx.clip();
  if (art.kind === "image") {
    cover(ctx, art.img, F.x, F.y, F.w, F.h);
    const g = ctx.createLinearGradient(0, F.y, 0, F.y + F.h);
    g.addColorStop(0, "rgba(251,246,234,.06)"); g.addColorStop(1, "rgba(60,40,15,.12)");
    ctx.fillStyle = g; ctx.fillRect(F.x, F.y, F.w, F.h);
  } else {
    // No picture: the tint lit from the middle, a soft disc and the icon large enough to carry
    // the page, so it weighs as much as the question page below.
    const cx = PAGE.w / 2, cy = F.y + F.h / 2;
    ctx.fillStyle = art.tint; ctx.fillRect(F.x, F.y, F.w, F.h);
    const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, F.w * 0.6);
    glow.addColorStop(0, "rgba(255,255,255,.55)"); glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow; ctx.fillRect(F.x, F.y, F.w, F.h);
    ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(cx, cy, 190, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(94,69,38,.18)"; ctx.lineWidth = 3; ctx.setLineDash([14, 12]);
    ctx.beginPath(); ctx.arc(cx, cy, 214, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `250px ${EMOJI}`; ctx.fillStyle = INK;
    ctx.fillText(art.emoji, cx, cy + 10);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(94,69,38,.35)"; ctx.lineWidth = 3; rr(ctx, F.x, F.y, F.w, F.h, 22); ctx.stroke();
  hinge(ctx, false);
}

/**
 * D872: the bottom page - the question and its four rows; the picked row green with white words,
 * no other colour changes. No "QUESTION 1 OF 10" line: the bar above the passport counts, and the
 * room goes to the rows.
 */
export function paintQuestion(ctx: Ctx, o: { q: TestQuestion; picked: string | null; fonts: Fonts }) {
  paper(ctx); hinge(ctx, true);
  // The question sits centred in the room between the hinge and the first row.
  const X = MARGIN + 6;
  ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const q = fit(ctx, o.q.text, PAGE.w - 2 * X, 700, o.fonts.body, { max: 54, min: 36 }, 2);
  const lineH = q.size * 1.18, mid = (36 + answerBox(0).y - 14) / 2;
  q.lines.forEach((l, i) => ctx.fillText(l, X, mid + (i - (q.lines.length - 1) / 2) * lineH));
  o.q.answers.slice(0, 4).forEach((a, j) => {
    const b = answerBox(j as 0 | 1 | 2 | 3), on = o.picked === a.id, my = b.y + b.h / 2;
    ctx.fillStyle = on ? PICKED : "rgba(255,255,255,.6)"; rr(ctx, b.x, b.y, b.w, b.h, b.h / 2); ctx.fill();
    if (!on) { ctx.strokeStyle = "rgba(122,92,52,.4)"; ctx.lineWidth = 3; rr(ctx, b.x, b.y, b.w, b.h, b.h / 2); ctx.stroke(); }
    const textX = a.icon ? b.x + 108 : b.x + 44;
    if (a.icon) { ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.font = `58px ${EMOJI}`; ctx.fillStyle = INK; ctx.fillText(a.icon, b.x + 32, my + 3); }
    ctx.fillStyle = on ? "#FFFFFF" : INK; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const t = fit(ctx, a.text, b.x + b.w - 40 - textX, 600, o.fonts.body, { max: 46, min: 30 }, 2);
    if (t.lines.length === 1) ctx.fillText(t.lines[0], textX, my + 2);
    else t.lines.forEach((l, i) => ctx.fillText(l, textX, my + 2 + (i - 0.5) * (t.size + 2)));
  });
}

/**
 * The intro's top page, inside the cover: "WELCOME", the test's characters side by side - what
 * the guest is about to find out which of they are - and the organiser's heading under them.
 */
export function paintWelcome(ctx: Ctx, o: { test: PassportTest; pictures: (HTMLImageElement | null)[]; fonts: Fonts }) {
  const F = SCENE_FRAME;
  paper(ctx);
  label(ctx, "WELCOME", F.x + 6, LABEL_Y, "left", o.fonts, PAPER_INK.name);
  ctx.save(); rr(ctx, F.x, F.y, F.w, F.h, 22); ctx.clip();
  ctx.fillStyle = "#E9E1F2"; ctx.fillRect(F.x, F.y, F.w, F.h);
  ctx.restore();
  ctx.strokeStyle = "rgba(94,69,38,.35)"; ctx.lineWidth = 3; rr(ctx, F.x, F.y, F.w, F.h, 22); ctx.stroke();

  // The characters in a row, as big as the row allows (portrait cards, 3:4).
  const ps = o.test.personalities.slice(0, 8), n = Math.max(1, ps.length);
  const pad = 40, gap = n > 5 ? 14 : 24, rowW = F.w - 2 * pad;
  const cw = Math.min(200, (rowW - gap * (n - 1)) / n), ch = Math.min(cw * (4 / 3), 290);
  const x0 = F.x + (F.w - (cw * n + gap * (n - 1))) / 2, y0 = F.y + 40 + (290 - ch) / 2;
  ps.forEach((p, i) => {
    const T = personalityShades(p.colour), x = x0 + i * (cw + gap), pic = o.pictures[i];
    ctx.save(); rr(ctx, x, y0, cw, ch, 20); ctx.clip();
    ctx.fillStyle = T.light; ctx.fillRect(x, y0, cw, ch);
    if (pic && pic.naturalWidth > 0) cover(ctx, pic, x, y0, cw, ch);
    else { ctx.fillStyle = T.accent; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = font(400, cw * 0.55, o.fonts.display); ctx.fillText(Array.from(p.name)[0] ?? "?", x + cw / 2, y0 + ch / 2); }
    ctx.restore();
    ctx.strokeStyle = T.dark; ctx.lineWidth = 4; rr(ctx, x, y0, cw, ch, 20); ctx.stroke();
  });

  ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const hd = fit(ctx, o.test.intro.heading, F.w - 80, 700, o.fonts.body, { max: 58, min: 38 }, 2);
  const mid = F.y + 40 + 290 + (F.h - 40 - 290) / 2, lh = hd.size * 1.15;
  hd.lines.forEach((l, i) => ctx.fillText(l, PAGE.w / 2, mid + (i - (hd.lines.length - 1) / 2) * lh));
  hinge(ctx, false);
}

/** About how long a test takes: some 12 seconds a question, never under a minute. */
export function testMinutes(questions: number): number {
  return Math.max(1, Math.round((questions * 12) / 60));
}

/** The intro's bottom page: the organiser's line, how long it takes, and Start. */
export function paintIntro(ctx: Ctx, o: { line: string; questions: number; fonts: Fonts }) {
  paper(ctx); hinge(ctx, true);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  const ln = fit(ctx, o.line, PAGE.w - 2 * (MARGIN + 40), 600, o.fonts.body, { max: 46, min: 32 }, 3);
  const lh = ln.size * 1.2, mid = 215;
  ln.lines.forEach((l, i) => ctx.fillText(l, PAGE.w / 2, mid + (i - (ln.lines.length - 1) / 2) * lh));
  const m = testMinutes(o.questions);
  ctx.fillStyle = PAPER_INK.label; ctx.font = font(600, 30, o.fonts.body);
  ctx.fillText(`${o.questions} questions · about ${m} minute${m === 1 ? "" : "s"}`, PAGE.w / 2, 360);
  const B = START_BUTTON;
  ctx.fillStyle = PICKED; rr(ctx, B.x, B.y, B.w, B.h, B.h / 2); ctx.fill();
  ctx.fillStyle = "#FFFFFF"; ctx.font = font(700, 46, o.fonts.body); ctx.fillText("Start", PAGE.w / 2, B.y + B.h / 2 + 2);
}

/** The top page above the name page. */
export function paintSign(ctx: Ctx, o: { fonts: Fonts }) {
  paper(ctx);
  ctx.fillStyle = "#E9E1F2"; rr(ctx, 46, 46, PAGE.w - 92, PAGE.h - 120, 30); ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `220px ${EMOJI}`; ctx.fillStyle = INK; ctx.fillText("✍️", PAGE.w / 2, 300);
  ctx.fillStyle = "#3B2A18"; ctx.font = font(700, 44, o.fonts.body); ctx.fillText("Almost done", PAGE.w / 2, 520);
  ctx.fillStyle = PAPER_INK.label; ctx.font = font(500, 30, o.fonts.body); ctx.fillText("Put your name on your passport", PAGE.w / 2, 572);
  hinge(ctx, false);
}

/** D874: "This passport belongs to", the name line (a DOM field sits over it while editable) and "That's me". */
export function paintName(ctx: Ctx, o: { name: string; fonts: Fonts; showName: boolean }) {
  paper(ctx); hinge(ctx, true);
  label(ctx, "THIS PASSPORT BELONGS TO", PAGE.w / 2, 120, "center", o.fonts);
  ctx.fillStyle = PAPER_INK.label; ctx.font = font(500, 28, o.fonts.body); ctx.textAlign = "center";
  ctx.fillText("Change it if you like. It goes on this passport only.", PAGE.w / 2, 190, PAGE.w - 120);
  const F = NAME_FIELD;
  if (o.showName) {
    ctx.fillStyle = "#3B2A18";
    const r = fit(ctx, o.name, F.w - 40, 600, o.fonts.hand, { max: 72, min: 40 });
    ctx.fillText(r.lines[0], PAGE.w / 2, F.y + F.h / 2);
  }
  ctx.strokeStyle = PAPER_INK.rule; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(F.x, F.y + F.h); ctx.lineTo(F.x + F.w, F.y + F.h); ctx.stroke();
  const B = NAME_BUTTON;
  ctx.fillStyle = PICKED; rr(ctx, B.x, B.y, B.w, B.h, 55); ctx.fill();
  ctx.fillStyle = "#FFFFFF"; ctx.font = font(700, 44, o.fonts.body); ctx.textBaseline = "middle"; ctx.fillText("That's me", PAGE.w / 2, B.y + B.h / 2 + 2);
}

/**
 * D875, D876, D881: the holder page. With a personality: the character, the personality's name
 * as a sticker, the holder line, and three labelled sections. `progress` 0..1 fills it in during
 * the reveal. Without one (no test): the heading, "PASSPORT HOLDER" and the name only.
 */
export function paintHolder(ctx: Ctx, o: {
  test: PassportTest | null; personality: Personality | null; holderName: string; picture: HTMLImageElement | null;
  progress: number; eventName: string; fonts: Fonts;
}) {
  paper(ctx); hinge(ctx, true);
  const f = o.fonts;
  const head = `${o.eventName} PASSPORT`.toUpperCase();
  if (!o.test || !o.personality) {
    ctx.fillStyle = PAPER_INK.name; ctx.textAlign = "center"; ctx.textBaseline = "middle"; spaced(ctx, 3);
    fit(ctx, head, PAGE.w - 140, 700, f.body, { max: 40, min: 24 }); ctx.fillText(head, PAGE.w / 2, 120, PAGE.w - 120); spaced(ctx, 0);
    label(ctx, "PASSPORT HOLDER", PAGE.w / 2, 330, "center", f);
    ctx.fillStyle = "#3B2A18";
    const r = fit(ctx, o.holderName, PAGE.w - 200, 600, f.hand, { max: 96, min: 48 });
    ctx.fillText(r.lines[0], PAGE.w / 2, 420);
    ctx.strokeStyle = PAPER_INK.rule; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(160, 480); ctx.lineTo(PAGE.w - 160, 480); ctx.stroke();
    return;
  }
  const P = o.personality, T = personalityShades(P.colour), labels = o.test.labels;
  const a = (from: number, to: number) => Math.max(0, Math.min(1, (o.progress - from) / (to - from)));
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = T.dark; spaced(ctx, 3); fit(ctx, head, PAGE.w - 120, 700, f.body, { max: 40, min: 22 }); ctx.fillText(head, PAGE.w / 2, 74, PAGE.w - 100); spaced(ctx, 0);

  // The character (D876 section 1's picture), fading in.
  const AX = 58, AY = 122, AW = 300, AH = 360;
  ctx.strokeStyle = "rgba(122,92,52,.4)"; ctx.lineWidth = 3; ctx.setLineDash([12, 10]); rr(ctx, AX, AY, AW, AH, 28); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = a(0, 0.3);
  ctx.save(); rr(ctx, AX, AY, AW, AH, 28); ctx.clip();
  ctx.fillStyle = T.light; ctx.fillRect(AX, AY, AW, AH);
  if (o.picture && o.picture.naturalWidth > 0) cover(ctx, o.picture, AX, AY, AW, AH);
  else { ctx.fillStyle = T.accent; ctx.font = font(400, 180, f.display); ctx.fillText(Array.from(P.name)[0] ?? "?", AX + AW / 2, AY + AH / 2); }
  ctx.restore();
  ctx.strokeStyle = T.dark; ctx.lineWidth = 4; rr(ctx, AX, AY, AW, AH, 28); ctx.stroke();
  ctx.globalAlpha = 1;

  // The personality's name, stamped on like a sticker.
  const k = a(0.25, 0.45);
  if (k > 0) {
    ctx.save(); ctx.translate(208, 520); const sc = 1.6 - 0.6 * k; ctx.scale(sc, sc); ctx.globalAlpha = k;
    ctx.font = font(400, 46, f.display); ctx.lineWidth = 10; ctx.strokeStyle = T.dark; ctx.lineJoin = "round";
    const squeeze = Math.min(1, 330 / ctx.measureText(P.name).width); ctx.scale(squeeze, 1);
    ctx.strokeText(P.name, 0, 0); ctx.fillStyle = T.light; ctx.fillText(P.name, 0, 0); ctx.restore();
  }
  label(ctx, "PASSPORT HOLDER", 208, 572, "center", f);
  ctx.fillStyle = "#3B2A18"; ctx.textAlign = "center";
  // A long name shrinks, then takes two lines rather than running off the page.
  const nm = fit(ctx, o.holderName, 320, 600, f.hand, { max: 52, min: 30 }, 2);
  if (nm.lines.length === 1) ctx.fillText(nm.lines[0], 208, 622);
  else nm.lines.forEach((l, i) => ctx.fillText(l, 208, 610 + i * 34));

  // Section 1: traits, three ticked in turn.
  const X = 410, RIGHT = 970;
  pill(ctx, X, 116, labels[0], T.dark, T.light, f);
  P.traits.slice(0, 6).forEach((t, i) => {
    const bx = X + 10 + (i % 3) * 190, by = 200 + Math.floor(i / 3) * 62;
    ctx.strokeStyle = PAPER_INK.name; ctx.lineWidth = 3; ctx.strokeRect(bx, by - 16, 32, 32);
    ctx.fillStyle = "#3B2A18"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    const tf = fit(ctx, t, 136, 500, f.body, { max: 26, min: 18 });
    ctx.fillText(tf.lines[0], bx + 46, by);
    const n = P.ticked.indexOf(i);
    if (n >= 0 && a(0.45 + n * 0.08, 0.5 + n * 0.08) >= 1) tick(ctx, bx, by, 0.85, PICKED);
  });
  // Section 2: one line.
  pill(ctx, X, 340, labels[1], T.dark, T.light, f);
  ctx.globalAlpha = a(0.7, 0.8); ctx.fillStyle = T.dark; ctx.textAlign = "left";
  const st = fit(ctx, P.style, RIGHT - X - 16, 600, f.hand, { max: 44, min: 28 });
  ctx.fillText(st.lines[0], X + 8, 432); ctx.globalAlpha = 1;
  dashed(ctx, X, RIGHT, 458, T.accent);
  // Section 3: the saying, one sentence written across the two lines - wrapped where it runs out
  // of room, never where the organiser's two fields happened to split it. Handwriting size first;
  // smaller only if it would not fit two lines.
  pill(ctx, X, 486, labels[2], T.dark, T.light, f);
  ctx.fillStyle = T.dark;
  const said = P.say.map((x) => x.trim()).filter(Boolean).join(" ");
  const sayW = RIGHT - X - 16;
  let sy = fit(ctx, said, sayW, 600, f.hand, { max: 40, min: 40 }, 2);
  if (sy.lines.length === 2 && sy.lines[1].endsWith("…") && !said.endsWith("…")) sy = fit(ctx, said, sayW, 600, f.hand, { max: 34, min: 28 }, 2);
  sy.lines.forEach((line, i) => {
    ctx.globalAlpha = a(0.8 + i * 0.1, 0.9 + i * 0.1);
    ctx.fillText(line, X + 8, 576 + i * 64);
  });
  ctx.globalAlpha = 1;
  // A line to write on for each line written; a short saying leaves no empty rule under it.
  sy.lines.forEach((_, i) => dashed(ctx, X, RIGHT, 600 + i * 64, T.accent));
}

export type PaintStamp = { image: HTMLImageElement | null; name: string };

/** One stamp pressed on the paper at its spot: the booth's artwork inked darker (D856), or the plain chop in the event's colour. */
export function drawStamp(ctx: Ctx, s: PaintStamp, spot: { x: number; y: number; rot: number; scale: number }, chop: { ring: string; check: string }, f: Fonts) {
  const size = 230 * spot.scale;
  ctx.save(); ctx.translate(spot.x, spot.y); ctx.rotate(spot.rot);
  if (s.image && s.image.naturalWidth > 0) {
    ctx.globalCompositeOperation = "multiply";
    ctx.filter = STAMP_ART_FILTER;
    const k = Math.min(size / s.image.naturalWidth, size / s.image.naturalHeight);
    const w = s.image.naturalWidth * k, h = s.image.naturalHeight * k;
    ctx.drawImage(s.image, -w / 2, -h / 2, w, h);
  } else {
    const r = size / 2;
    ctx.strokeStyle = chop.ring; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, 0, r - 6, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.45; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, r - 26, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.strokeStyle = chop.check; ctx.lineWidth = 12; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(-34, -18); ctx.lineTo(-10, 6); ctx.lineTo(34, -38); ctx.stroke();
    ctx.fillStyle = chop.ring; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const n = fit(ctx, s.name.toUpperCase(), r * 1.3, 700, f.body, { max: 26, min: 16 });
    ctx.fillText(n.lines[0], 0, 40);
  }
  ctx.restore();
}

/** D877: the stamp page - the rosette, "ENTRIES · STAMPS", and every stamp at its spot, overlapping. */
export function paintStamps(ctx: Ctx, o: { seed: string; stamps: PaintStamp[]; chop: { ring: string; check: string }; fonts: Fonts }) {
  paper(ctx);
  ctx.save(); ctx.translate(PAGE.w / 2, PAGE.h / 2); ctx.strokeStyle = "rgba(160,122,69,.12)"; ctx.lineWidth = 1.5;
  for (let d = 0; d < 180; d += 20) { ctx.save(); ctx.rotate((d * Math.PI) / 180); ctx.beginPath(); ctx.ellipse(0, 0, 230, 80, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  ctx.restore();
  ctx.fillStyle = "rgba(122,92,52,.55)"; ctx.textAlign = "center"; ctx.font = font(700, 20, o.fonts.body); spaced(ctx, 6);
  ctx.fillText("ENTRIES · STAMPS", PAGE.w / 2, 52); spaced(ctx, 0);
  o.stamps.forEach((s, i) => drawStamp(ctx, s, stampSpot(i, o.seed), o.chop, o.fonts));
  hinge(ctx, false);
}
