"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ArrowUpRight, ChevronRight, LogOut } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger,
} from "@/components/ui/sidebar";
import { signOut } from "@/app/login/actions";
import { groupsFor, type Item } from "./nav";
import { APP_NAME, APP_MARK } from "@/lib/app-name";

type Event = { id: string; name: string; status: string; check_in_enabled: boolean };

const STATUS_VARIANT: Record<string, "success" | "secondary" | "default"> = {
  live: "success",
  draft: "secondary",
  ended: "secondary",
  archived: "default",
};

export function AppSidebar({ email, event }: { email: string; event?: Event | null }) {
  const pathname = usePathname();
  const groups = groupsFor(event);
  // Overview's href is a prefix of every other item in its section, so it only lights up on an
  // exact match; the rest also match their own sub-routes.
  const root = event ? `/admin/events/${event.id}` : "/admin/events";
  const isActive = (i: Item) => pathname === i.href || (i.href !== root && pathname.startsWith(`${i.href}/`));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        {/* The collapse button sits on the sidebar it collapses, beside the name. Collapsed to
            icons there is only room for one of the two, and the button is the one that gets
            the sidebar back; AdminHeader keeps its own copy only on a phone, where the sidebar
            is a sheet that is not on screen until it is opened. */}
        <div className="flex items-center gap-1">
          <Link href="/admin" className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1 font-extrabold group-data-[collapsible=icon]:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={APP_MARK} alt="" width={28} height={28} className="size-7 shrink-0" />
            <span className="truncate">{APP_NAME}</span>
          </Link>
          <SidebarTrigger className="shrink-0 text-muted-foreground group-data-[collapsible=icon]:mx-auto" title="Toggle sidebar (Ctrl+B)" />
        </div>

        {event && (
          <Link
            href="/admin/events"
            className="flex items-center gap-2 rounded-lg bg-muted p-2.5 transition-colors hover:bg-accent group-data-[collapsible=icon]:hidden"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-sm font-bold">{event.name}</span>
              <span><Badge variant={STATUS_VARIANT[event.status] ?? "secondary"}>{event.status}</Badge></span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        )}
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.title}>
            <SidebarGroupLabel>{g.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((i) => (
                  <SidebarMenuItem key={i.href}>
                    <SidebarMenuButton
                      render={i.newTab ? <a href={i.href} target="_blank" rel="noopener" /> : <Link href={i.href} />}
                      isActive={isActive(i)}
                      tooltip={i.label}
                    >
                      <Icon name={i.icon} size={18} />
                      <span>{i.label}</span>
                      {i.newTab && (
                        <>
                          <ArrowUpRight aria-hidden className="ml-auto size-3.5 text-muted-foreground" />
                          <span className="sr-only">(opens in a new tab)</span>
                        </>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <form action={signOut}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SignOutButton email={email} />
            </SidebarMenuItem>
          </SidebarMenu>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Its own component because `useFormStatus` only reads the form it is rendered inside. */
function SignOutButton({ email }: { email: string }) {
  const { pending } = useFormStatus();
  return (
    <SidebarMenuButton type="submit" tooltip="Sign out" disabled={pending} aria-busy={pending} className="text-muted-foreground">
      {pending ? <Spinner /> : <LogOut />}
      <span className="truncate">{pending ? "Signing out…" : email}</span>
    </SidebarMenuButton>
  );
}
