/**
 * Holds the `@modal` slot so opening an attendee from the table intercepts the detail
 * route into a dialog over the list, while a direct link or a refresh still lands on the
 * full page below.
 */
export default function AttendeesLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return <>{children}{modal}</>;
}
