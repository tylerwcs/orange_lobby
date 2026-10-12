import { CopyButton } from "@/components/admin/CopyButton";
import { Icon } from "@/components/ui/icon";
import { buttonVariants } from "@/components/ui/button";

/**
 * A link to hand out: the URL itself, and a Copy button. Used for the crew, host and display links.
 *
 * With `qr`, the link's QR sits beside it - small enough to scan off the screen as a test - and
 * a Download QR button fetches the print-size PNG (D491).
 */
export function ShareLink({ label, url, qr }: {
  label: string;
  url: string;
  /** `src`: the preview, a data URL made on the server. `href`: the print-size download. */
  qr?: { src: string; href: string };
}) {
  const row = (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <a href={url} className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-primary">{url}</a>
        <CopyButton value={url} label={`${label.toLowerCase()} link`} />
      </div>
      {qr && (
        <a href={qr.href} download className={`${buttonVariants({ variant: "outline", size: "sm" })} self-start`}>
          <Icon name="download" size={16} />Download QR
        </a>
      )}
    </div>
  );
  if (!qr) return row;
  return (
    <div className="flex items-start gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr.src} alt={`QR code for the ${label.toLowerCase()} link`} width={88} height={88} className="size-22 shrink-0 rounded-lg bg-white ring-1 ring-foreground/10" />
      {row}
    </div>
  );
}
