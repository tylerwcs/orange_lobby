"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ChevronRight, LogOut } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { signOut } from "@/app/login/actions";
import { groupsFor, type Item } from "./nav";

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
        <Link href="/admin" className="flex items-center gap-2.5 px-2 py-1 font-extrabold">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">OL</span>
          <span className="truncate group-data-[collapsible=icon]:hidden">Orange Lobby</span>
        </Link>

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
                      render={<Link href={i.href} />}
                      isActive={isActive(i)}
                      tooltip={i.label}
                    >
                      <Icon name={i.icon} size={18} />
                      <span>{i.label}</span>
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
