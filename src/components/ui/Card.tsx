import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] ${className}`}>{children}</div>;
}

export type ButtonVariant = "primary" | "secondary" | "danger";
type BtnProps = { children: React.ReactNode; variant?: ButtonVariant; className?: string; icon?: IconName };
const btnBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-sm font-bold transition-colors duration-150 active:translate-y-px disabled:opacity-50 disabled:active:translate-y-0";
const btnVariant = { primary: "bg-brand-strong text-white hover:brightness-110", secondary: "border border-line bg-surface text-ink hover:bg-canvas", danger: "bg-danger-soft text-red-700 hover:brightness-95" };

/** Button styling for the places that need a plain `<a>` — downloads and external links — so the class strings stay in one place. */
export function buttonClass(variant: ButtonVariant = "primary"): string {
  return `${btnBase} ${btnVariant[variant]}`;
}

export function Button({ children, variant = "primary", className = "", icon, ...rest }: BtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${buttonClass(variant)} ${className}`} {...rest}>{icon && <Icon name={icon} size={18} />}{children}</button>;
}

export function ButtonLink({ children, href, variant = "primary", className = "", icon }: BtnProps & { href: string }) {
  return <Link href={href} className={`${buttonClass(variant)} ${className}`}>{icon && <Icon name={icon} size={18} />}{children}</Link>;
}
