// Boss sentences of the slime game (D790): original everyday English, lowercase a–z and single
// spaces, no proper nouns, nothing `obscenity` flags (tests/qualifier/game/sentences.test.ts).
import { randInt } from "./rng";

const LIST = `
the cat is asleep
we need more milk
my tea is cold
the bus was late
please close the door
the soup smells good
rain is coming soon
she found her keys
the baby is laughing
dinner is almost ready
the toast is burnt
our team won the match
the clock in the hall stopped
the new chair is very comfortable
the lemon cake needs more sugar
the dog wants to play outside
we planted tomatoes last spring
my phone battery is nearly empty
he forgot his umbrella again
the kettle is boiling now
please pass me the salt
the shop opens at nine
our neighbors have a new puppy
the garden needs some water
i left my coat upstairs
the bread is still warm
a cool breeze came through the window
the kids built a snowman
my shoes are full of sand
she painted the fence blue
i made a cup of hot chocolate
the flowers in the vase are wilting
the printer ran out of paper again
the river is high after the rain
a tiny spider lives behind the bookshelf
my pencil broke during the test
the street lamps turn on at dusk
the train was crowded this morning so i stood
we walked along the beach at sunset
my brother always takes the last cookie
the library has a quiet room upstairs
please remember to water the plants tomorrow
the cat knocked a cup off the table
we ordered pizza and watched a movie
the old bridge creaks when the wind blows
he makes pancakes every weekend for the family
the lights went out during the storm
i like to read before i fall asleep
she keeps a small notebook in her bag
the market sells fresh fruit every morning
our car needs new tires before winter
the birds sing loudly outside my window
my keys were in my pocket the whole time
the farmer drove his tractor across the muddy field
the waiter brought us two glasses of cold water
we heard thunder far away over the hills
the museum has a room full of old clocks
she wrapped the gift in bright yellow paper
the old dog sleeps by the fire every evening
a warm bowl of soup is perfect on a cold day
the leaves turn red and gold before they fall
we cleaned the whole house before the guests arrived
the moon looked huge as it rose above the trees
the puppy chewed a hole in my favorite slipper
the elevator was broken so we took the stairs
she learned to ride a bike when she was six
our picnic blanket blew away in the strong wind
please turn off the oven when the timer rings
the field was covered in bright yellow flowers
the ducks followed their mother across the pond
we should leave early so we can find a parking spot
the soup tasted better the next day after it rested
my grandmother taught me how to fold paper boats
the coffee machine at work makes a strange noise
he ran to catch the bus but it had already gone
the children laughed when the puppy chased its own tail
please wash your hands before you sit down to eat
the sky turned orange and pink as the sun went down
i always lose one sock when i do the laundry
the mountain path was steep but the view was worth it
the pond froze so we went skating after school
i need to buy eggs and flour and sugar for the cake
the music was too loud so we moved to the garden
he spilled juice on his shirt right before the meeting
the shelves were full of jars of jam and honey
we swapped stories around the campfire until the fire went out
the soup needs a pinch of salt and a little pepper
the cookies are cooling on a rack by the open window
i keep my old letters in a box under the bed
we shared an umbrella on the way back from the station
the guitar sounds better now that he has changed the strings
she wrote a shopping list and then left it on the counter
my uncle grows peppers and beans in a corner of his yard
the plane landed early so we had time for a slow breakfast
we packed sandwiches and juice for a picnic by the lake
the teacher asked everyone to bring a favorite book to class
my friend sent me a photo of the biggest pumpkin i have ever seen
the bakery on the corner sells the best bread in town
after the rain the street smelled fresh and the puddles shone
she bought a plant for her desk and gave it a funny name
the movie was so long that half of the audience fell asleep
we waited in line for an hour just to try the new ice cream
he fixed the squeaky door with a little bit of oil
the wind blew my hat into the river and it floated away
the bus driver waved at the children as they crossed the road
our cat sleeps in a sunny spot on the kitchen floor all afternoon
we counted the stars until we were too sleepy to stay awake
the noodles were too spicy for me but my friend loved them
the cold wind made our cheeks turn red on the walk home
every morning the baker opens the shop before the sun comes up
my little sister wants to be a pilot so she can fly far away
we found an old map in the attic and spent all afternoon reading it
the hotel room had a small balcony with a view of the busy harbor
if you leave the window open the cat will climb out onto the roof
the kids built a fort out of blankets and pillows in the living room
`;

export const SENTENCES: readonly string[] = Object.freeze(
  LIST.split("\n").map((s) => s.trim()).filter(Boolean),
);

const wordsOf = (s: string) => s.split(" ");

/**
 * The sentence boss `n` (1-based) carries: at least 3 + 2n words, so each boss is longer than
 * the last. Picks among the sentences long enough; when none is, joins random sentences until
 * the words are enough.
 */
export function bossSentence(r: () => number, n: number): string[] {
  const need = 3 + 2 * n;
  const long = SENTENCES.filter((s) => wordsOf(s).length >= need);
  if (long.length > 0) return wordsOf(long[randInt(r, long.length)]);
  const words: string[] = [];
  while (words.length < need) words.push(...wordsOf(SENTENCES[randInt(r, SENTENCES.length)]));
  return words;
}
