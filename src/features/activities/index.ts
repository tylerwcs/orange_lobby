/**
 * The activities feature's server entry (D402): everything in `client.ts`, plus its screens -
 * server components and the client components they render, for the route pages to place.
 */
export * from "./client";

// Its database reads and writes, and the server-only parts built on them (D421).
export * from "./db/activities";
export * from "./db/activity-requests";
export * from "./db/booths";
export * from "./db/challenge";
export * from "./db/doors";
export * from "./lib/portal-activity-entries";
export * from "./lib/challenge-data";
export * from "./lib/submission-file";
export * from "./lib/submission-uploads";
export * from "./lib/request-notify";

// The two activity pages, for their route files to render (D419), and the server actions the
// list page's add forms post to.
export * from "./admin/ActivityDetailPage";
export * from "./portal/ActivityPage";
export * from "./admin/actions";

// Shared by every kind: the admin list and its rows, the detail page's menu and tabs, the
// Overview's activity summary; the portal's Activities tab, card parts, home row and dialog.
export * from "./admin/ActivityRows";
export * from "./admin/ActivityMenu";
export * from "./admin/ActivityTabs";
export * from "./admin/ActivityOverview";
export * from "./admin/NewActivityMenu";
export * from "./portal/ActivitiesTab";
export * from "./portal/ActivityParts";
export * from "./portal/HomeActivities";
export * from "./portal/ActivityActionDialog";

// Booking: sessions, bookings by day, who has not booked, change requests; the portal's grid.
export * from "./kinds/booking/SessionDays";
export * from "./kinds/booking/BookingsByDay";
export * from "./kinds/booking/UnbookedPanel";
export * from "./kinds/booking/RequestQueue";
export * from "./kinds/booking/ActivitySessions";
export * from "./kinds/booking/ActivityBooking";

// Submission: the answers table and the chasing panels; the portal's form, history and helpers.
export * from "./kinds/submission/SubmissionTable";
export * from "./kinds/submission/MissingPanel";
export * from "./kinds/submission/GroupsNotDonePanel";
export * from "./kinds/submission/ParticipationPanel";
export * from "./kinds/submission/SubmissionFields";
export * from "./kinds/submission/SubmissionHistory";
export * from "./kinds/submission/SubmitFor";
export * from "./kinds/submission/EntryActions";
export * from "./kinds/submission/GroupStatus";
export * from "./kinds/submission/HealthConsentField";

// A scored submission (Project Mileage): the committee's leaderboard and teams; the tracker.
export * from "./kinds/submission/scoring/LeaderboardPanel";
export * from "./kinds/submission/scoring/TeamGrid";
export * from "./kinds/submission/scoring/tracker/TrackerTabs";
export * from "./kinds/submission/scoring/tracker/WeekStrip";
export * from "./kinds/submission/scoring/tracker/DayRing";
export * from "./kinds/submission/scoring/tracker/EntryTimeline";
export * from "./kinds/submission/scoring/tracker/MyTeam";
export * from "./kinds/submission/scoring/tracker/Leaderboard";

// Passport: booths and their scanner links; the stamp grid.
export * from "./kinds/passport/BoothList";
export * from "./kinds/passport/BoothQr";
export * from "./kinds/passport/PassportGrid";
