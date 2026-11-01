import { requireEventAccess } from "@/lib/access";
import { loadDoors, listActivities, VerificationTab } from "@/features/activities";
import { listGroups } from "@/lib/db/groups";
import { AddressTab, eventAddress } from "@/features/domains";
import { activityKindsFor, eventFeatures, WhatsOnTab, hiddenSettingsParts } from "@/features/catalogue";
import { appBaseUrl, shareLink, type ShareLinkKind } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RememberedTabs } from "@/components/admin/RememberedTabs";
import { UnsavedGuard } from "@/components/admin/UnsavedGuard";
import { rememberedTab } from "@/lib/remembered-tab";
import { cookies } from "next/headers";
import { previewLanding } from "@/lib/preview-link";
import { getAttendee } from "@/lib/db/attendees";
import { pinnableFields } from "@/lib/pinned-fields";
import { getPlaces, placesLabel } from "@/features/registration-queue";
import { SETTINGS_TAB_LABELS, settingsTabs } from "./tabs";
import { EventTab } from "./tabs/EventTab";
import { PortalLookTab } from "./tabs/PortalLookTab";
import { RegistrationTab } from "./tabs/RegistrationTab";
import { CheckInTab } from "./tabs/CheckInTab";
import { CommitteeTab } from "./tabs/CommitteeTab";
import { DangerTab } from "./tabs/DangerTab";

export const metadata = { title: "Settings" };

/**
 * D778: one tab per feature. Event, Portal look and Registration are each their own form, posting
 * to their own action, which writes only that tab's columns - so a tab that is not open, or not
 * saved, is never re-saved by another. Each is keepMounted, so switching tabs keeps what is typed.
 * Every save redirects through flashPath, which shows loading.tsx and mounts this page afresh,
 * so a save loses any other tab's unsaved edits: each form is keyed on its own columns only
 * (formKey), and UnsavedGuard warns before another tab's edits are lost. Status, the pins, the
 * Me page and every card on Check-in apply on their own, outside those three forms.
 */
export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ev, actor } = await requireEventAccess(id);
  // D553, D563: What's on, Committee, Verification, Address and the Danger zone are the Ecopia
  // team's. A committee member never gets their tab, and their panels (AddressTab guards itself
  // and would 404 the page) are not rendered at all.
  const isAdmin = actor.kind === "admin";
  const features = await eventFeatures(ev.id);
  const hidden = hiddenSettingsParts(features);
  // D502: Verification is about submissions, so it shows only when the event can run them.
  const verifying = activityKindsFor(features).includes("submission");
  const base = appBaseUrl();
  const [{ cps, tallies, registered: total }, jar, allActivities, groups, addr, places] = await Promise.all([
    loadDoors(ev.id), cookies(), listActivities(ev.id), listGroups(ev.id), eventAddress(ev), getPlaces(ev.id),
  ]);
  const bookingActivities = allActivities.filter((a) => a.kind === "booking");
  const forms = allActivities.filter((a) => a.kind === "submission");
  // D686: how full it is, under the limit field. The waiting/pending counts ride along when there are any.
  const taken = placesLabel(places.taken, places.limit);
  const queued = [places.waiting > 0 ? `${places.waiting} waiting` : "", places.pending > 0 ? `${places.pending} pending approval` : ""].filter(Boolean).join(", ");
  // The handed-out links with their QR beside them (D491): a preview to scan off the screen,
  // and the print-size PNG from the export route.
  const share = async (kind: ShareLinkKind) => {
    const url = shareLink(kind, addr);
    return { url, qr: { src: await qrDataUrl(url), href: `/admin/events/${ev.id}/export/share-qr/${kind}` } };
  };
  const [portalShare, registrationShare] = await Promise.all([share("portal"), share("registration")]);
  // D716: the attendee the preview link opens as, when it would still land on their page.
  const previewPick = ev.status === "draft" && ev.preview_attendee_id ? await getAttendee(ev.preview_attendee_id) : null;
  const previewAs = previewPick && previewLanding(ev, previewPick) !== `/e/${ev.slug}` ? previewPick : null;
  // Reopen on the tab that was open: every action on this page redirects back to it.
  const tabScope = `settings:${ev.id}`;
  const tabs = settingsTabs({ admin: isAdmin, hidden, verifying });
  const openTab = rememberedTab(jar, tabScope, tabs) ?? "event";
  const pinnable = pinnableFields(ev.registration_questions, ev.attendee_fields, groups.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Settings" subtitle={ev.name} />

      <RememberedTabs scope={tabScope} defaultValue={openTab} className="gap-4">
        <UnsavedGuard />
        <TabsList className="group-data-horizontal/tabs:h-auto max-w-full justify-start overflow-x-auto overflow-y-hidden">
          {tabs.map((t) => <TabsTrigger key={t} value={t}>{SETTINGS_TAB_LABELS[t]}</TabsTrigger>)}
        </TabsList>

        {tabs.includes("whats-on") && (
          <TabsContent value="whats-on" className="flex flex-col gap-4 @container">
            <WhatsOnTab eventId={ev.id} />
          </TabsContent>
        )}

        <TabsContent value="event" keepMounted className="flex flex-col gap-4 @container">
          <EventTab ev={ev} admin={isAdmin} base={base} previewAs={previewAs} portalShare={portalShare} registrationShare={registrationShare} />
        </TabsContent>

        <TabsContent value="look" keepMounted className="flex flex-col gap-4 @container">
          <PortalLookTab ev={ev} showLanguage={!hidden.includes("language")} pinnable={pinnable} />
        </TabsContent>

        <TabsContent value="registration" keepMounted className="flex flex-col gap-4 @container">
          <RegistrationTab ev={ev} taken={taken} queued={queued} activities={allActivities} />
        </TabsContent>

        <TabsContent value="checkin" className="flex flex-col gap-4 @container">
          <CheckInTab ev={ev} cps={cps} tallies={tallies} bookingActivities={bookingActivities} forms={forms} base={base} />
        </TabsContent>

        {tabs.includes("committee") && (
          <TabsContent value="committee" className="flex flex-col gap-4">
            <CommitteeTab ev={ev} showAlerts={!hidden.includes("committee_alerts")} />
          </TabsContent>
        )}

        {tabs.includes("verification") && (
          <TabsContent value="verification" className="flex flex-col gap-4">
            <VerificationTab ev={ev} />
          </TabsContent>
        )}

        {tabs.includes("address") && (
          <TabsContent value="address" className="flex flex-col gap-4">
            <AddressTab eventId={ev.id} />
          </TabsContent>
        )}

        {tabs.includes("danger") && (
          <TabsContent value="danger" className="flex flex-col gap-4">
            <DangerTab ev={ev} total={total} />
          </TabsContent>
        )}
      </RememberedTabs>
    </div>
  );
}
