/**
 * The portal's own wording in English (D736): the source of truth. `ms.ts` must match its
 * shape exactly, which `tsc` and tests/language.test.ts both check. Sentences with numbers or
 * an organiser-typed name are functions; the name goes in as an argument and is never
 * translated.
 *
 * Rich lines (the home-screen guide's steps) mark bold with **…** and an inline icon with
 * {name}; `RichLine` draws them. The phone's own button names stay in English in both
 * languages, because that is what the phone shows.
 */
export const en = {
  common: {
    languageLabel: "Language / Bahasa",
    english: "English",
    malay: "Bahasa Malaysia",
    /** The Me page's row for the switcher. */
    languageRow: "Language · Bahasa",
    view: "View",
  },
  nav: {
    home: "Home",
    agenda: "Agenda",
    info: "Info",
    groups: "Groups",
    activities: "Activities",
    me: "Me",
    sections: "Sections",
    skipToContent: "Skip to content",
    meButton: "Me: your badge and details",
    choiceWaiting: ", a choice is waiting",
    homeOf: (eventName: string) => `Home: ${eventName}`,
    comingSoon: "Coming soon. Check back closer to the event.",
  },
  home: {
    announcements: "Announcements",
    today: "Today",
    activities: "Activities",
    seeAll: "See all",
    yourActivities: "Your activities",
    slide: (n: number, of: number) => `${n} of ${of}`,
    showSlide: (n: number, of: number) => `Show ${n} of ${of}`,
    ownBadgeTitle: "Open your own badge link",
    ownBadgeBody: "Scan the QR code on your badge to see your table and check-in status.",
  },
  announcements: {
    title: "Announcements",
    none: "No announcements yet.",
    pinned: "Pinned",
  },
  badge: {
    checkedIn: "Checked in: ",
    notCheckedIn: (checkpoint: string) => `Not checked in to ${checkpoint} yet`,
    showQr: "Show my QR code",
    qrHelp: "Show this at check-in if you do not have your printed badge.",
    qrAlt: "Your QR code",
  },
  me: {
    table: (table: string) => `Table ${table}`,
    showBadge: "Show my badge",
    yourDetails: "Your details",
    email: "Email",
    toldUs: "What you told us",
  },
  cards: {
    sessionsSoon: "Sessions coming soon",
    seatsLeft: (range: string, left: number) => `${range} · ${left} seat${left === 1 ? "" : "s"} left`,
    checkedIn: "Checked in",
    waiting: "Waiting for the committee",
    booked: "Booked",
    closed: "Closed",
    pickOne: "Pick one",
    choose: "Choose",
    full: "Full",
    book: "Book",
    open: "Open",
    submit: "Submit",
    doneToday: "Done for today",
    submissionDone: "Submission done",
    groupDone: "Group done",
    needsGroup: "Needs a group",
    noTrack: "No track yet",
    otherTrack: "Other track",
    fullToday: "Full today",
    starts: (date: string) => `Starts ${date}`,
    comingSoon: "Coming soon",
    opens: (when: string) => `Opens ${when}`,
  },
  agenda: {
    title: "Agenda",
    loadingDay: "Loading the day",
    soon: "Agenda will be published soon.",
    now: "NOW",
    booked: "Booked",
    addToCalendar: "Add to calendar",
    nothingToday: "Nothing scheduled on this day.",
    imageAlt: "Agenda image",
  },
  calendar: {
    appleSub: "iPhone, iPad or Mac",
    googleSub: "Android or Gmail",
    outlookSub: "Your work Microsoft 365 account",
  },
  info: {
    soon: "More information will be published soon.",
  },
  picture: {
    open: (title: string) => `Open ${title} full size`,
    show: (title: string) => `Show picture for ${title}`,
  },
  install: {
    row: "Add this page to your home screen",
    title: "Add your event page to your home screen",
    description: "One tap to your badge, agenda and updates.",
    add: "Add to home screen",
    yourPhone: "Your phone",
    otherDevice: "Do this on your phone: open your event link there first.",
    iosLabel: "How to add it on iPhone",
    androidLabel: "How to add it on Android",
    ios: [
      "Open this page in **Safari**. Came from WhatsApp? Tap **Share** or the **compass** icon, then **Open in Safari**.",
      "Tap the menu button {menu} or {ellipsis} beside the address bar. On older iPhones, skip to the next step: the Share button is in the bar at the bottom.",
      "Tap **Share** {share}.",
      "Scroll down the list and tap **Add to Home Screen** {squarePlus}.",
      "Tap **Add**. The icon appears on your home screen.",
    ],
    android: [
      "Open this page in **Chrome**. Came from WhatsApp? Tap the menu {dots}, then **Open in Chrome**.",
      "Tap the menu {dots} at the top right.",
      "Scroll down the menu and tap **Install and create shortcut** {install}. On some phones it says **Add to Home screen** or **Install app**.",
      "Tap **Install** or **Add**. The icon appears on your home screen.",
    ],
    notNow: "Not now",
  },
};

/** The dictionary's shape, with every string widened so the Malay can say something else. */
type Widen<T> = T extends string ? string
  : T extends (...a: infer A) => string ? (...a: A) => string
  : T extends readonly string[] ? string[]
  : { [K in keyof T]: Widen<T[K]> };
export type Dict = Widen<typeof en>;
