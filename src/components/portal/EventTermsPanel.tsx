/**
 * The event's own terms (D540), read in place. The panel scrolls rather than pushing the button
 * below it a screen further down on a phone, and takes focus so a keyboard can scroll it too.
 * Long words (an email address in a clause) break rather than widening the page.
 * `html` must already be sanitised (`eventTermsHtml`). Used by the registration form and the
 * portal's gate (D544), so both show the terms the same way.
 */
export function EventTermsPanel({ html }: { html: string }) {
  return (
    <div tabIndex={0} aria-label="Event terms"
      className="rich-text prose prose-sm max-h-72 overflow-y-auto [overflow-wrap:anywhere] rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}
