export function brandStyle(primary: string | null | undefined): Record<string, string> {
  const brand = primary && /^#[0-9a-fA-F]{6}$/.test(primary) ? primary : "#F97316";
  return {
    "--brand": brand,
    "--brand-ink": `color-mix(in oklch, ${brand} 72%, black)`,
    "--brand-soft": `color-mix(in oklch, ${brand} 14%, white)`,
  };
}
