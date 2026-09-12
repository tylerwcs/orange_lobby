import { SidebarTrigger } from "@/components/ui/sidebar";

export function AdminHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start gap-4">
      {/* The only way back to the nav once the sidebar collapses on a narrow screen. */}
      <SidebarTrigger className="-ml-1 mt-0.5 md:hidden" />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
