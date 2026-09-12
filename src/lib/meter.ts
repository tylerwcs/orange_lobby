/**
 * The arithmetic behind a progress bar, kept apart from whatever draws it. It moved here
 * when the hand-rolled Meter gave way to shadcn's Progress (D65): the component went, the
 * edge cases it had learned did not.
 */
export function meterPercent(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

// ARIA requires max > min, so an empty event (max === 0, or negative) must not emit
// aria-valuemax={0}.
export function meterAriaMax(max: number): number {
  return Math.max(1, max);
}

// aria-valuenow clamped into [0, valueMax] to match the visual fill, which meterPercent
// already clamps against the same bound.
export function meterAriaValue(value: number, max: number): number {
  const valueMax = meterAriaMax(max);
  return Math.min(valueMax, Math.max(0, value));
}
