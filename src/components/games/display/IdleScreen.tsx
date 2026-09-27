import { APP_NAME } from "@/lib/app-name";
import type { DisplayState } from "@/lib/games/wire";

/** Nothing on stage (D285): the event's name and a nudge to have phones ready. */
export function IdleScreen({ event }: { event: DisplayState["event"] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_srgb,var(--brand)_35%,black),black_70%)]">
      {event.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- an organiser upload of unknown size; next/image adds nothing on a 1080p canvas
        <img src={event.logoUrl} alt="" className="max-h-[260px] max-w-[900px] object-contain" />
      )}
      <h1 className="max-w-[1700px] text-center text-[110px] font-extrabold leading-none">{event.name}</h1>
      <p className="text-5xl opacity-70">Get ready…</p>
      <p className="text-3xl opacity-50">Open {APP_NAME} on your phone to play</p>
    </div>
  );
}
