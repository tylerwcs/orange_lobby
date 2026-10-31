import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { RowActions } from "@/components/admin/RowActions";
import { Modal } from "@/components/admin/Modal";
import { ADDON_KEYS, CORE_KEYS, FEATURES, STORED_ADDONS, type FeatureKey, type StoredAddon } from "../catalogue";
import { has } from "../features";
import { eventFeatures, eventUsage } from "../db";
import { optionsInUse } from "../usage";
import { setAddonAction, addCustomModuleAction, updateCustomModuleAction, removeCustomModuleAction } from "./actions";

const OFF_NOTE = "Nothing is deleted. Turn it back on and everything returns.";
const offMessage = (key: StoredAddon) =>
  key === "custom_domain"
    ? `Turn off ${FEATURES[key].name}? The Address tab is hidden, but attendee links keep using the event's own address. To remove that address, turn ${FEATURES[key].name} back on and remove it in Settings → Address. ${OFF_NOTE}`
    : `Turn off ${FEATURES[key].name}? It disappears from the admin. ${OFF_NOTE}`;

function ModuleForm({ action, name = "", description = "" }: { action: (fd: FormData) => Promise<void>; name?: string; description?: string }) {
  // Unique per form: the add dialog and an edit dialog can both be in the page.
  const id = useId();
  return (
    <form action={action} className="grid grid-cols-1 gap-4">
      <Field label="Name" name="name" defaultValue={name} placeholder="Photo mosaic wall" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-bold">What it is (optional)</label>
        <Textarea id={id} name="description" rows={4} defaultValue={description} maxLength={2000} />
      </div>
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}

const isStored = (key: FeatureKey): key is StoredAddon => (STORED_ADDONS as readonly string[]).includes(key);

export async function WhatsOnTab({ eventId }: { eventId: string }) {
  const [features, usage] = await Promise.all([eventFeatures(eventId), eventUsage(eventId)]);
  const used = optionsInUse(usage);
  const back = `/admin/events/${eventId}/settings`;
  const onKeys = [...CORE_KEYS, ...ADDON_KEYS].filter((key) => has(features, key));
  const offAddons = STORED_ADDONS.filter((key) => !has(features, key));
  return (
    <>
      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>On for this event</CardTitle>
          <CardDescription>Everything this event has, and its options, marked In use where this event has them set.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border border-t border-border">
            {onKeys.map((key) => {
              const feature = FEATURES[key];
              return (
                <li key={key} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
                        {feature.name}
                        {feature.tier === "experimental" && <Badge variant="outline">Experimental</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">{feature.summary}</span>
                    </span>
                    {isStored(key) && (
                      <form action={setAddonAction.bind(null, eventId, key, false, back)}>
                        <ConfirmButton message={offMessage(key)} confirmLabel="Turn off">Turn off</ConfirmButton>
                      </form>
                    )}
                  </div>
                  {feature.options.length > 0 && (
                    <ul className="flex flex-col gap-1 border-l border-border pl-3">
                      {feature.options.map((o) => (
                        <li key={o.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className="font-medium">{o.name}</span>
                          {o.experimental && <Badge variant="outline">Experimental</Badge>}
                          {used.has(o.key) && <Badge variant="success">In use</Badge>}
                          <span className="text-muted-foreground">{o.where}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>Available</CardTitle>
          <CardDescription>Add-ons this event does not have. Turn one on and it appears in the admin.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {offAddons.length === 0 ? (
            <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">Every add-on is on for this event.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {offAddons.map((key) => (
                <li key={key} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      {FEATURES[key].name}
                      {FEATURES[key].tier === "experimental" && <Badge variant="outline">Experimental</Badge>}
                    </span>
                    <span className="text-xs text-muted-foreground">{FEATURES[key].summary}</span>
                  </span>
                  <form action={setAddonAction.bind(null, eventId, key, true, back)}>
                    <SubmitButton variant="outline">Turn on</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden pb-0">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <span className="flex flex-col gap-1.5">
            <CardTitle>Custom modules</CardTitle>
            <CardDescription>Bespoke work sold with this event. Nothing in the admin depends on them.</CardDescription>
          </span>
          <Modal title="Add a custom module" trigger="Add custom module" icon="plus">
            <ModuleForm action={addCustomModuleAction.bind(null, eventId)} />
          </Modal>
        </CardHeader>
        <CardContent className="px-0">
          {features.custom.length === 0 ? (
            <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">None. Add one when an event needs something bespoke.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {features.custom.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold">{m.name}</span>
                    {m.description && <span className="line-clamp-2 text-xs text-muted-foreground">{m.description}</span>}
                  </span>
                  <RowActions
                    name={m.name}
                    edit={{ title: "Edit custom module", form: <ModuleForm action={updateCustomModuleAction.bind(null, eventId, m.id)} name={m.name} description={m.description ?? ""} /> }}
                    remove={{ action: removeCustomModuleAction.bind(null, eventId, m.id), message: `Remove "${m.name}"?` }}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
