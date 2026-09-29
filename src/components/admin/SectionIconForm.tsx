import { DEFAULT_SECTION_ICONS, type IconSection } from "@/lib/launcher";
import { Icon, type IconName } from "@/components/ui/icon";
import { ImageField } from "@/components/admin/ImageField";
import { SubmitButton } from "@/components/admin/SubmitButton";

/**
 * The editor behind the settings button on the Agenda, Info and Groups admin pages (D222, D362): the picture
 * this section's round button shows on the portal home, and a field to replace it.
 *
 * The field holds only the organiser's own upload. The default illustration is shown beside it
 * as what attendees see now, not inside it - otherwise Remove would offer to delete a picture
 * that is not theirs, and would do nothing. A section with no default illustration (My group)
 * shows the glyph its button falls back to instead.
 */
export function SectionIconForm({ action, section, current, glyph = "grid" }: {
  action: (formData: FormData) => Promise<void>;
  section: IconSection;
  current: string | null;
  /** What the button shows with no picture at all; only reached by a section with no default. */
  glyph?: IconName;
}) {
  const shown = current ?? DEFAULT_SECTION_ICONS[section] ?? null;
  return (
    <form action={action} className="grid gap-4 p-1">
      <div className="flex items-center gap-3">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="size-16 shrink-0 rounded-full bg-accent object-contain" />
        ) : (
          <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent text-primary"><Icon name={glyph} size={28} /></span>
        )}
        <p className="text-sm text-muted-foreground">
          {current ? "Your picture, on the portal home." : "The default picture, on the portal home."}{" "}
          Upload one to replace it{current ? ", or remove yours to go back to the default" : ""}.
        </p>
      </div>
      <ImageField label="Icon image" name="icon_image" url={current} description="A square picture with a transparent background works best." />
      <SubmitButton>Save icon</SubmitButton>
    </form>
  );
}
