"use client";
import { Tabs } from "@/components/ui/tabs";
import { rememberTab } from "@/lib/remembered-tab";

/**
 * The ui Tabs, remembering which tab is open (remembered-tab.ts) so the page reopens on it
 * after an action's redirect. The server passes the remembered tab in as `defaultValue`.
 */
export function RememberedTabs({ scope, defaultValue, className, children }: {
  scope: string;
  defaultValue: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tabs defaultValue={defaultValue} onValueChange={(v) => rememberTab(scope, String(v))} className={className}>
      {children}
    </Tabs>
  );
}
