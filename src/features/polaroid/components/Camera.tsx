import styles from "../polaroid.module.css";

const STRIPE = ["#FF3B30", "#FF9500", "#FFCC00", "#4CD964", "#5AC8FA"];

/**
 * The instant camera (D482), after the old Digital Wall's upload screen: tap the lens or the red
 * shutter to take or choose a photo. Fixed size, so the print can eject from its slot.
 */
export function Camera({ onShoot, disabled, flash }: { onShoot: () => void; disabled: boolean; flash: boolean }) {
  return (
    <div className="relative w-[300px] rounded-[40px] border-b-8 border-gray-300 bg-[#f3f3f3] px-6 pb-4 pt-7 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]">
      <div className="mb-5 flex h-12 items-start justify-between px-2">
        <div className={`relative h-12 w-24 overflow-hidden rounded-xl border-2 border-gray-600 bg-gray-800 ${flash ? styles.flash : ""}`}>
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent" />
        </div>
        <div className="flex size-12 items-center justify-center rounded-xl border-2 border-gray-700 bg-[#1a1a1a]">
          <div className="size-4 rounded-full bg-black/50 blur-sm" />
        </div>
      </div>
      <div className="relative flex h-40 justify-center">
        <div aria-hidden className="absolute left-1/2 top-full z-0 flex h-14 w-6 -translate-x-1/2">
          {STRIPE.map((c) => <div key={c} className="flex-1" style={{ background: c }} />)}
        </div>
        <button type="button" onClick={onShoot} disabled={disabled} aria-label="Take or choose a photo"
          className="relative z-10 flex size-40 items-center justify-center rounded-full border-[6px] border-[#2a2a2a] bg-[#1a1a1a] shadow-xl transition-transform active:scale-95 disabled:cursor-default">
          <span className="relative flex size-32 items-center justify-center overflow-hidden rounded-full border border-gray-800 bg-black">
            <span className="absolute right-6 top-6 h-4 w-8 rotate-45 rounded-full bg-white/10 blur-md" />
            <span className="flex size-24 items-center justify-center rounded-full border border-gray-800 bg-[#0a0a0a]">
              <span className="size-10 rounded-full bg-[#151515] shadow-inner" />
            </span>
            {!disabled && <span className={`absolute text-[10px] font-bold tracking-widest text-white ${styles.lensPulse}`}>TAP TO SNAP</span>}
          </span>
        </button>
        <button type="button" onClick={onShoot} disabled={disabled} aria-label="Shutter"
          className="absolute bottom-0 right-1 z-20 size-16 translate-y-1/2 rounded-full border-[6px] border-white bg-[#ff3b30] shadow-lg active:scale-95" />
      </div>
      <div className="relative z-30 mx-auto mt-11 h-4 w-[260px] rounded-lg border-b border-zinc-700 bg-[#1a1a1a] shadow-inner" />
    </div>
  );
}
