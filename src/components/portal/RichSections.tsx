import { sanitizeHtml } from "@/lib/sanitize";
import { splitSections, toRichHtml } from "@/lib/rich-text";

/**
 * An activity's description as the blocks its page is read in: About first, then one block per
 * section heading the organiser wrote ("Scoring", "Prizes"), each under a thick rule so the
 * page scans as a set of answers rather than one long column (`splitSections` decides where
 * each starts).
 *
 * Sanitised here, at the last moment, whatever the column holds - the editor cleans on save
 * too, but a description written before it existed is only plain text, and `toRichHtml` turns
 * that into paragraphs first.
 */
export function RichSections({ html }: { html: string | null }) {
  const { intro, sections } = splitSections(sanitizeHtml(toRichHtml(html)));
  const blocks = [...(intro ? [{ title: "About", html: intro }] : []), ...sections];
  if (blocks.length === 0) return null;
  return (
    <div className="flex flex-col">
      {blocks.map((b, i) => (
        <section key={i} className="-mx-4 border-t-8 border-muted px-4 py-5 md:mx-0 md:px-0">
          <h2 className="mb-2 text-lg font-extrabold">{b.title}</h2>
          {b.html && <div className="rich-text prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: b.html }} />}
        </section>
      ))}
    </div>
  );
}
