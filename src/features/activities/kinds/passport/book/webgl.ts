let webgl: boolean | null = null;

/**
 * D889: whether this phone can draw the 3D passport (three needs WebGL 2). Probed once per page;
 * the probe context is released at once. False without a DOM. A copy of the qualifier's check:
 * a feature never reaches into another's internals.
 */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  if (webgl !== null) return webgl;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webgl = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

/** Reduced motion, read once per call (the book reads it when an animation starts). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
