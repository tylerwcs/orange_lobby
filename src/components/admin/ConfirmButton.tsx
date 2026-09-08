"use client";
export function ConfirmButton({ message, children, className = "" }: { message: string; children: React.ReactNode; className?: string }) {
  return (
    <button type="submit" className={`inline-flex min-h-10 items-center rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm font-bold ${className}`}
      onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
