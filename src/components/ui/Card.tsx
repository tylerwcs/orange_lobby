import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius-card)] border border-line bg-surface ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-1 text-3xl font-extrabold leading-none">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Pill({ children, tone = "brand" }: { children: React.ReactNode; tone?: "brand" | "ink" | "muted" }) {
  const cls = tone === "brand" ? "bg-brand-soft text-brand-ink" : tone === "ink" ? "bg-ink text-white" : "bg-canvas text-muted";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}

type BtnProps = { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; className?: string; icon?: IconName };
const btnBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-sm font-bold transition disabled:opacity-50";
const btnVariant = { primary: "bg-brand text-ink hover:brightness-95", secondary: "border border-line bg-surface text-ink hover:bg-canvas", danger: "border border-red-200 bg-surface text-red-700 hover:bg-red-50" };

export function Button({ children, variant = "primary", className = "", icon, ...rest }: BtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${btnBase} ${btnVariant[variant]} ${className}`} {...rest}>{icon && <Icon name={icon} size={18} />}{children}</button>;
}

export function ButtonLink({ children, href, variant = "primary", className = "", icon }: BtnProps & { href: string }) {
  return <Link href={href} className={`${btnBase} ${btnVariant[variant]} ${className}`}>{icon && <Icon name={icon} size={18} />}{children}</Link>;
}
