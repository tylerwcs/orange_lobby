import { CopyButton } from "@/components/admin/CopyButton";

/** A link to hand out: the URL itself, and a Copy button. Used for the crew, host and display links. */
export function ShareLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <a href={url} className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-primary">{url}</a>
        <CopyButton value={url} label={`${label.toLowerCase()} link`} />
      </div>
    </div>
  );
}
