import { SidebarTrigger } from "@/components/ui/sidebar";

export function AdminHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start gap-4">
      {/* Phone only. On a computer the toggle lives on the sidebar itself (AppSidebar); on a
          phone the sidebar is a sheet off screen, so the page needs a way to open it. */}
      <SidebarTrigger className="-ml-1 mt-0.5 md:hidden" />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
