import Link from "next/link";

export const metadata = {
  title: "Privacy Policy · ECP Hub",
  description: "How ECP Hub collects, uses and protects attendee personal data.",
};

/**
 * Public, unauthenticated, and rendered entirely from constants — no database, no props.
 *
 * Meta requires a reachable privacy policy URL before an app can be published, and it is
 * fetched by their reviewer rather than by a signed-in person, so this must answer on a cold
 * request with no session. It is listed in `STATIC_PAGES` in tests/press-feedback.test.ts for
 * the same reason the login page is: there is nothing to wait for, so a skeleton would only
 * flash.
 */
const UPDATED = "24 September 2026";
const CONTACT = "huine.liew@ecopiaevents.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 md:py-16">
      <header className="space-y-2 border-b pb-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">ECP Hub · Last updated {UPDATED}</p>
      </header>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground/90">
        <Section title="Who we are">
          <p>
            ECP Hub is an event platform operated by <strong>Qarmakrome Productions Sdn. Bhd.</strong>,
            a company registered in Malaysia, trading as Ecopia Events. We are the data controller for
            the personal data described below, and we are responsible for looking after it.
          </p>
          <p>
            This policy explains what we collect when you attend an event we run, why we hold it, who
            else sees it, and how to get it changed or removed.
          </p>
        </Section>

        <Section title="What we collect">
          <p>Depending on the event and how you were invited, we may hold:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Who you are</strong> — your name, email address, mobile number, and the company or department you belong to.</li>
            <li><strong>Details you give us when registering</strong> — such as dietary requirements, shirt or jacket size, or whether you want overnight accommodation. These vary by event and are only the questions that event asks.</li>
            <li><strong>Details your organiser gives us</strong> — where you did not register yourself, your employer or the event host supplies your details so we can prepare your badge and seat.</li>
            <li><strong>What happens at the event</strong> — when you were checked in, which sessions or breakouts you were assigned to, activities you booked, and stands you visited.</li>
            <li><strong>Anything you submit</strong> — including files or photos you upload through a form at the event.</li>
            <li><strong>Message delivery records</strong> — where we send you your event link by WhatsApp, we keep the number it went to and whether it arrived.</li>
          </ul>
          <p>
            We do not collect payment card details, government identification numbers, or any special
            category data beyond what an event explicitly asks for.
          </p>
        </Section>

        <Section title="Why we hold it">
          <p>
            To run the event you are attending, and nothing else. That means preparing your badge and
            seat, checking you in at the door, showing you your own agenda, managing bookings and
            accommodation, and sending you the link to your personal event page.
          </p>
          <p>
            We do not sell personal data. We do not use it for advertising, and we do not profile you.
          </p>
        </Section>

        <Section title="Your personal event link">
          <p>
            Each attendee receives a unique link to their own event page. Anyone holding that link can
            see the details on it, so please treat it as personal and avoid forwarding it. If you think
            your link has been shared, contact us and we will issue you a new one, which stops the old
            one working immediately.
          </p>
        </Section>

        <Section title="Who else sees it">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>The organisation hosting your event.</strong> Where we run an event on behalf of a
              client, that client receives attendee details including names, contact details, responses
              given at registration, and attendance. They are responsible for their own handling of it.
            </li>
            <li>
              <strong>Meta Platforms</strong>, when we message you on WhatsApp — they carry the message
              and report whether it was delivered.
            </li>
            <li>
              <strong>Our technology suppliers</strong> — Supabase, which hosts our database and stored
              files, and Vercel, which runs the application. Both process data on our instructions only.
            </li>
          </ul>
          <p>
            We will also disclose data where the law requires it. We do not share it with anyone else.
          </p>
        </Section>

        <Section title="Where it is kept">
          <p>
            Our database and uploaded files are hosted in <strong>Singapore</strong>, and the application
            runs from the same region. Where you are messaged on WhatsApp, Meta processes that message on
            their own infrastructure, which may be outside Malaysia.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We keep attendee data for up to <strong>twelve months</strong> after an event, so that we can
            answer questions about attendance and reconcile it with the host. After that, or sooner if
            the host asks, we permanently erase the personal details, remove uploaded files, and
            invalidate every personal link for that event.
          </p>
        </Section>

        <Section title="Keeping it safe">
          <p>
            Access to attendee data is restricted to named administrators who sign in with their own
            account. The platform carries no advertising trackers, no analytics services, and no
            third-party scripts. Cookies are used only to keep an administrator signed in — attendees
            are not tracked.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under Malaysia&rsquo;s Personal Data Protection Act 2010 you may ask us to show you the
            personal data we hold about you, correct anything that is wrong, limit how we use it, or
            delete it. You can also withdraw your consent to being contacted at any time.
          </p>
          <p>
            Write to <a className="font-medium underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a> and
            we will respond within 21 days. Where the data was given to us by an event host, we may need
            to refer your request to them as well, and we will tell you if so.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we change how we handle personal data we will update this page and change the date at the
            top. This policy was last updated on {UPDATED}.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Qarmakrome Productions Sdn. Bhd. (trading as Ecopia Events)<br />
            <a className="font-medium underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </Section>
      </div>

      <footer className="mt-12 border-t pt-6 text-sm">
        <Link href="/" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Back to ECP Hub
        </Link>
      </footer>
    </main>
  );
}
