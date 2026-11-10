import { DEFAULT_LABELS, newTestId, type PassportTest, type Personality, type TestQuestion } from "./settings";

type Key = "trailblazer" | "navigator" | "dreamer" | "foodie";

/** D886: the four travellers, as the approved sketch drew them. Pictures ship in /public. */
const PERSONALITIES: Record<Key, Omit<Personality, "id">> = {
  trailblazer: {
    name: "TRAILBLAZER", colour: "#E8693C", picture: "/passport/characters/trailblazer.svg",
    traits: ["Bold", "Curious", "Spontaneous", "Patient", "Tidy", "Chill"], ticked: [0, 1, 2],
    style: "Exit row, then wing it", say: ["“Let's just go, we'll", "figure it out there.”"],
    blurb: "First off the plane and already planning the next adventure.",
  },
  navigator: {
    name: "NAVIGATOR", colour: "#3E7BD9", picture: "/passport/characters/navigator.svg",
    traits: ["Organised", "Calm", "Curious", "Spontaneous", "Reliable", "Loud"], ticked: [0, 1, 4],
    style: "Aisle seat, first off", say: ["“I've made a", "spreadsheet for this.”"],
    blurb: "Has the map, the backup map and the train times.",
  },
  dreamer: {
    name: "DAYDREAMER", colour: "#B06BD6", picture: "/passport/characters/daydreamer.svg",
    traits: ["Creative", "Gentle", "Punctual", "Curious", "Loud", "Thoughtful"], ticked: [0, 1, 5],
    style: "Window seat, always", say: ["“Wait, look at", "that sky.”"],
    blurb: "Travels for the view, the light and the quiet moments.",
  },
  foodie: {
    name: "FLAVOUR HUNTER", colour: "#D9433B", picture: "/passport/characters/flavour-hunter.svg",
    traits: ["Adventurous", "Warm", "Tidy", "Generous", "Quiet", "Curious"], ticked: [0, 1, 3],
    style: "Next to the snack trolley", say: ["“We're not leaving", "till we try that.”"],
    blurb: "Plans every trip around the next meal.",
  },
};

type Row = [icon: string, text: string, who: Key];
/** D886: ten travel scenes, reworded from Klook's "The Best You", not copied. */
const QUESTIONS: { scene: string; text: string; answers: [Row, Row, Row, Row] }[] = [
  { scene: "Before you fly", text: "Your out-of-office reply says…", answers: [["🧭", "Gone exploring. Back soon!", "trailblazer"], ["📎", "Away. Itinerary attached.", "navigator"], ["🌅", "Off chasing sunsets", "dreamer"], ["🍜", "Out eating my way around town", "foodie"]] },
  { scene: "Boarding", text: "Which seat are you taking?", answers: [["🪟", "Window, obviously", "dreamer"], ["🚶", "Aisle, first one off", "navigator"], ["🦵", "Exit row, all the legroom", "trailblazer"], ["🥨", "Closest to the snack trolley", "foodie"]] },
  { scene: "Window view", text: "You look out the window and see…", answers: [["🌃", "Neon city streets", "foodie"], ["🏔️", "Snowy slopes", "trailblazer"], ["🏖️", "Sun-kissed sand", "dreamer"], ["🗺️", "Rivers and caves to map", "navigator"]] },
  { scene: "Arrivals", text: "How are you getting from the airport?", answers: [["🚲", "Rent a bicycle", "dreamer"], ["🚌", "Party bus!", "trailblazer"], ["🚄", "Express train, on time", "navigator"], ["🛵", "Vintage scooter to the food street", "foodie"]] },
  { scene: "Somewhere in the city", text: "You're lost. What's the plan?", answers: [["🗣️", "Ask the auntie at the stall", "foodie"], ["🧘", "Breathe and enjoy it", "dreamer"], ["🎲", "Trial and error", "trailblazer"], ["📱", "Offline map, already saved", "navigator"]] },
  { scene: "Check-in", text: "Where are you staying?", answers: [["🏝️", "A dreamy resort", "dreamer"], ["🏨", "A boutique hotel I researched", "navigator"], ["🛏️", "A hostel full of new friends", "trailblazer"], ["🏠", "A homestay with a great cook", "foodie"]] },
  { scene: "The bucket list", text: "Top of your bucket list?", answers: [["🪂", "Skydiving", "trailblazer"], ["☕", "A quiet book café", "dreamer"], ["🍢", "A street food crawl", "foodie"], ["🏛️", "Every museum in town", "navigator"]] },
  { scene: "Night market", text: "At the market, what catches your eye?", answers: [["🗺️", "A hand-drawn map", "navigator"], ["🧶", "Handmade crafts", "dreamer"], ["🍡", "Snacks I can't name", "foodie"], ["🤝", "Anything I can haggle for", "trailblazer"]] },
  { scene: "Last night", text: "Last night of the trip. You're…", answers: [["🎤", "Singing karaoke", "trailblazer"], ["🍽️", "At a fancy dinner", "foodie"], ["🎆", "Watching fireworks", "dreamer"], ["🧳", "Packed and asleep early", "navigator"]] },
  { scene: "Going home", text: "Pick a souvenir to bring home", answers: [["💌", "A postcard to myself", "dreamer"], ["🌶️", "A box of local spices", "foodie"], ["💥", "A wild story", "trailblazer"], ["📌", "A pin for every city", "navigator"]] },
];

/**
 * D886: the ready-made travel set, switched off and with fresh ids each time it is loaded, so
 * loading it twice into two passports never shares an id. Questions ship without pictures: the
 * plain panel shows until the organiser uploads (D873).
 */
export function travelSet(): PassportTest {
  const ids = Object.fromEntries((Object.keys(PERSONALITIES) as Key[]).map((k) => [k, newTestId("p")])) as Record<Key, string>;
  const questions: TestQuestion[] = QUESTIONS.map((q) => ({
    id: newTestId("q"), scene: q.scene, text: q.text, image: null,
    answers: q.answers.map(([icon, text, who]) => ({ id: newTestId("a"), text, icon, personality: ids[who] })),
  }));
  const personalities: Personality[] = (Object.keys(PERSONALITIES) as Key[]).map((k) => ({ id: ids[k], ...PERSONALITIES[k], traits: [...PERSONALITIES[k].traits], ticked: [...PERSONALITIES[k].ticked], say: [...PERSONALITIES[k].say] }));
  return { on: false, questions, personalities, labels: [...DEFAULT_LABELS], cover: { colour: null, crest: null } };
}
