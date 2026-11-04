// The slime world's colours (D793): low-poly pastel, from the look the user picked (mockup card
// A). 3D colours are fixed by design, so they live here as hex numbers, not theme classes.

export const SKY = 0xcfe6ee;
export const FOG = 0xdcecf0;
/** FogExp2 density: slimes at 18 m stay clear, the mountains at 60 m go soft. */
export const FOG_DENSITY = 0.02;

/** Grass, and a lighter grass the ground's facets vary towards. */
export const GROUND = 0xb5dca0;
export const GROUND_LIGHT = 0xc4e4ae;
/** The few low grass tufts on the open grass. */
export const GRASS_TUFT = 0x9ccf86;

export const HEMI_SKY = 0xffffff;
export const HEMI_GROUND = 0xa7c49a;
export const HEMI_INTENSITY = 1.1;
export const SUN = 0xfff3e0;
export const SUN_INTENSITY = 1.7;

export const TRUNK = 0xa98466;
/** Gem-cut (icosahedron) crowns. */
export const CROWNS = [0x8cc97a, 0x7dbd8c, 0xa3d18a] as const;
/** Cone pines. */
export const PINES = [0x6fae86, 0x86c49a] as const;
/** Lavender-grey rocks. */
export const ROCKS = [0xb9b6cc, 0xc9c3d6] as const;
/** Blue-green mountains on the horizon. */
export const MOUNTAINS = [0x9cc7c9, 0xa9c9b8, 0xb4cfd8] as const;
export const SNOW = 0xffffff;
export const CLOUD = 0xffffff;

/**
 * The eight slime colours. `Slime.look` (0-3, from the engine) picks a pair and the slime's id the
 * one of the pair (`slimeColour`): green or mint, blue or lavender, pink or coral, yellow or peach.
 */
export const SLIMES = [
  0x8fd67a, 0x86c5ee, 0xf5a3c7, 0xf7d270,
  0x6fd6be, 0xb9a0f0, 0xf28b82, 0xf7ad78,
] as const;
/** The darker underside and spots of a slime: its colour × this. */
export const SLIME_SHADE = 0.55;
/** The model's horns and the tongue. */
export const HORN = 0xe9d3b0;
export const TONGUE = 0xe0627f;
export const TEETH = 0xffffff;

/** A slime's colour: `look` (any integer) and its id choose one of SLIMES. */
export function slimeColour(look: number, id: number): number {
  return SLIMES[(Math.abs(look) % 4) + 4 * (Math.abs(id) % 2)];
}
export const EYE = 0xffffff;
export const PUPIL = 0x1b1530;
export const BLUSH = 0xf28fa6;
/** The boss's crown. */
export const CROWN_GOLD = 0xf2c14e;
/** The bonus star (D819): a bright gold slime, its sparkles and its bubble. */
export const STAR = 0xffc21f;
/** A stuck slime pulses towards this as its 3 s run out. */
export const WARN = 0xff6b5e;
export const SHADOW = 0x000000;

/** The toy blaster: body, trim (nozzle, rings, tank glass), the hand holding it. */
export const BLASTER = 0x8a9bd8;
export const BLASTER_TRIM = 0xf5cf7a;
export const BLASTER_DARK = 0x5f6fae;
export const HAND = 0xffd2a8;
/** The tank's glass and the muzzle flash. */
export const GLASS = 0xffffff;
export const FLASH = 0xffffff;

/** Word labels: bubble, ink, typed letters, the locked label's edge. */
export const LABEL_BG = 0xffffff;
export const LABEL_INK = 0x3b4a5a;
export const LABEL_TYPED = 0xe0627f;
export const LABEL_LOCK = 0xe0627f;
/** The title screen's lettering (its layered shadow is slime pink and blue). */
export const TITLE_INK = 0xffffff;
/** A biting slime's bubble (its edge, tag and bar are WARN). */
export const BITE_BG = 0xfff1ef;
/** The boss's health bar. */
export const HEALTH = 0xe0627f;
export const HEALTH_TRACK = 0xe6e9ee;
/** On fire (the top multiplier, D816): the flame chip, the glow round the screen and the typing bar. */
export const FIRE = 0xffa53d;
export const FIRE_HOT = 0xff5e3a;

/** A palette colour as CSS, for the DOM labels: `css(0x3b4a5a)` → `#3b4a5a`, with `alpha` → `rgba(...)`. */
export function css(hex: number, alpha?: number): string {
  if (alpha === undefined) return `#${hex.toString(16).padStart(6, "0")}`;
  return `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${alpha})`;
}
