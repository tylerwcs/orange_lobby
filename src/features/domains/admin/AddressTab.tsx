import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { ShareLink } from "@/components/admin/ShareLink";
import { genericLink } from "@/lib/links";
import { requireEvent } from "@/lib/db/events";
import { requireAdmin } from "@/lib/auth";
import { domainConfig, isSubdomainOf } from "../hosts";
import { eventAddress, listEventDomains } from "../db";
import { vercelDomainStatus, type DomainStatus } from "../vercel";
import { addOwnDomainAction, addSubdomainAction, makePrimaryAction, removeDomainAction } from "./actions";

const STATUS: Record<DomainStatus, { label: string; tone: "success" | "destructive" | "outline" }> = {
  live: { label: "Live", tone: "success" },
  "not-added": { label: "Not added to the Vercel project yet", tone: "destructive" },
  unverified: { label: "Waiting for Vercel to verify", tone: "outline" },
  unknown: { label: "Can't check with Vercel", tone: "outline" },
};

/** D424: where attendees open this event. Staff pages stay on the main address. */
export async function AddressTab({ eventId }: { eventId: string }) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const { root } = domainConfig();
  const [domains, addr] = await Promise.all([listEventDomains(ev.id), eventAddress(ev)]);
  // Subdomains of our root are covered by the wildcard, so they are always live.
  const statuses = await Promise.all(domains.map((d) => (isSubdomainOf(d.domain, root) ? Promise.resolve("live" as const) : vercelDomainStatus(d.domain))));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Attendee address</CardTitle>
          <CardDescription>
            Where QR codes, WhatsApp links and the registration link take attendees. Organiser, crew and scanner pages stay on
            the main address. Set this before badges are printed: a printed QR code keeps working only while its address stays on this event.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ShareLink label="Event link" url={genericLink(addr)} />
          {domains.length > 0 && (
            <ul className="flex flex-col divide-y rounded-md border">
              {domains.map((d, i) => (
                <li key={d.domain} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-mono">{d.domain}</span>
                  {d.is_primary ? <Badge>Primary</Badge> : <Badge variant="outline">Forwards to primary</Badge>}
                  <Badge variant={STATUS[statuses[i]].tone}>{STATUS[statuses[i]].label}</Badge>
                  <span className="ml-auto flex gap-2">
                    {!d.is_primary && (
                      <form action={makePrimaryAction.bind(null, ev.id, d.domain)}>
                        <SubmitButton variant="outline" size="sm">Make primary</SubmitButton>
                      </form>
                    )}
                    <form action={removeDomainAction.bind(null, ev.id, d.domain)}>
                      <ConfirmButton message={`Remove ${d.domain}? Links and QR codes that use it will stop working.`} confirmLabel="Remove">
                        Remove
                      </ConfirmButton>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a subdomain</CardTitle>
          <CardDescription>Ready straight away, nothing to set up in Vercel.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addSubdomainAction.bind(null, ev.id)} className="flex max-w-md flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1"><Field label={`Name (becomes name.${root})`} name="label" placeholder="sk2summit" /></div>
            <SubmitButton>Add</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add the client&apos;s own domain</CardTitle>
          <CardDescription>Buy it on Vercel and add it to the ECP Hub project first, then add it here.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addOwnDomainAction.bind(null, ev.id)} className="flex max-w-md flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1"><Field label="Domain" name="domain" placeholder="sk2summit.com" /></div>
            <SubmitButton>Add</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
