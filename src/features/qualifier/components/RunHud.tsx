"use client";

/** The sprint's numbers (D772): the time left, whole seconds rounded up, and the live wpm. */
export function RunHud({ leftMs, wpm }: { leftMs: number; wpm: number }) {
  const secs = Math.max(0, Math.ceil(leftMs / 1000));
  return (
    <div className="flex w-full items-baseline justify-between font-game tabular-nums">
      <p className={`text-3xl leading-none ${secs <= 5 ? "text-destructive" : ""}`}>
        {secs}<span className="ml-1 text-base text-muted-foreground">s</span>
      </p>
      <p className="text-3xl leading-none">
        {wpm.toFixed(1)}<span className="ml-1 text-base text-muted-foreground">wpm</span>
      </p>
    </div>
  );
}
