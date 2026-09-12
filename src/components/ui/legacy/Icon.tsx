import { iconPath, type IconName } from "./icon-paths";

export function Icon({ name, size = 22, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconPath(name) }} />
  );
}
export type { IconName };
