// Where Slime Splat lives (D797): under the event's Games, in the admin and on the portal.

/** The game's name, as players and organisers see it. */
export const GAME_NAME = "Slime Splat";

/** The admin's Slime Splat page: settings and the leaderboard. A player's runs are under it. */
export const slimeAdminPath = (eventId: string): string => `/admin/events/${eventId}/games/slime-splat`;
