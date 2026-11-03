// The words the small slimes carry (D767, D790): common English, lowercase a–z only, no
// proper nouns, nothing `obscenity` flags (tests/qualifier/words.test.ts checks all of it).
// English only, like every live game. The last lines are events and hospitality (D815): we are an
// event agency, and so are the people playing.
const LIST = `
  the of and to in is you that it he was for on are as with his they at be this from have or by
  one had not but what all were when we there can an your which their said if do will each about
  how up out them then she many some so these would other into has more her two like him see time
  could no make than first been its who now people my made over did down only way find use water
  long little very after words called just where most know get through back much before go good
  new write our used me man too any day same right look think also around another came come work
  three word must because does part even place well such here take why help put different away
  again off went old number great tell men say small every found still between name should home
  big give air line set own under read last never us left end along while might next sound below
  saw something thought both few those always looked show large often together asked house world
  going want school important until form food keep children feet land side without boy once animal
  life enough took sometimes four head above kind began almost live page got earth need far hand
  high year mother light country father let night picture being study second soon story since
  white ever paper hard near sentence better best across during today however sure knew try told
  young sun thing whole hear example heard several change answer room sea against top turned learn
  point city play toward five using himself usually money lot seen car front body stood plan dog
  bird door cold gave open face black blue red green yellow brown orange pink gray tree flower
  grass river lake ocean mountain hill rock stone sand wind rain snow storm cloud sky moon star
  fire ice table chair bed window floor wall roof kitchen garden street road bridge town village
  farm field forest island beach park shop store market bank office factory hotel hospital library
  museum theater station airport apple bread butter cheese egg fish meat milk rice sugar salt
  soup tea coffee juice cake fruit lemon grape peach banana cherry berry bean corn potato tomato
  onion carrot pepper horse cow pig sheep goat duck chicken rabbit mouse cat lion tiger bear wolf
  fox deer monkey elephant whale shark snake frog spider bee ant fly insect hat coat shirt dress
  shoe boot sock glove belt pocket button zipper ring watch clock bag box basket bottle cup glass
  plate bowl fork knife spoon pan pot arm leg foot finger thumb nose ear eye mouth tooth tongue
  hair skin bone heart brain neck shoulder knee elbow chest stomach happy sad angry tired hungry
  thirsty sleepy proud brave gentle quiet loud quick slow strong weak warm cool hot wet dry clean
  dirty empty full heavy soft rough smooth sharp bright dark run walk jump swim climb dance sing
  talk speak shout whisper laugh smile cry listen wait stop start finish begin carry throw catch
  push pull lift drop fall rise turn move pass hold touch reach buy sell pay cost price cheap
  trade order choose offer accept refuse agree allow ask beg borrow lend share save spend earn
  build create design draw paint cut fold bend break fix mend repair wash cook bake boil fry mind
  idea dream hope wish fear doubt trust belief truth fact reason cause effect result chance luck
  choice habit skill talent power force energy speed space shape size color voice music song rhythm
  class lesson teacher student book pencil pen letter math science history art language reading
  writing exam test grade score family friend neighbor stranger leader member group team crowd
  party guest host visitor partner company business customer client manager worker driver pilot
  doctor nurse farmer artist writer singer morning evening afternoon yesterday tomorrow week month
  season spring summer autumn winter holiday birthday weekend moment minute hour early late rarely
  travel journey trip ticket train bus plane boat ship truck bike wheel engine fuel path map guide
  wonder imagine remember forget believe guess decide prepare practice improve teach explain describe
  discuss suggest invite welcome thank please sorry board screen keyboard phone camera radio signal
  network system program computer machine device tool battery cable switch lamp event stage seat
  row aisle entrance exit lobby badge list schedule agenda session speaker panel workshop lunch
  dinner snack drink winner prize medal trophy award game match race round final contest champion
  player coach rule goal court track fan rocket launch orbit planet comet galaxy cosmos gravity
  lunar solar thrust cabin gate tunnel beam boost glide soar simple easy clear plain honest fair
  true real pure fresh fine nice lovely pretty bold calm humble wise clever silly funny serious
  careful lucky busy ready inside outside beside behind beyond among within upon onto past future
  present bring send leave stay visit return enter join meet greet follow lead notice spot seek
  search hunt chase escape hide cover reveal north south east west center middle corner edge border
  bottom single double triple half quarter piece slice bit pile stack heap bunch bundle pair couple
  dozen hundred thousand million joy peace love care worry pride mercy grace honor duty justice
  freedom law brush comb rinse scrub polish sweep dust pack sort shelf drawer cabinet closet canvas
  frame sketch pattern stripe dot curve circle square triangle cube sphere metal steel copper
  silver gold plastic wood cloth cotton silk wool leather rubber castle tower temple church palace
  fountain harbor valley desert jungle canyon cave plant seed root stem leaf branch bark petal
  bloom grow harvest soil noise echo whistle bell drum horn string guitar piano violin flute ahead
  alone apart aside backward downward forward upward later nearby able active actual amazing ancient
  annual basic beautiful central certain common complete constant correct current daily deep direct
  eager equal exact familiar famous flat formal free general giant global grand huge human instant
  joint known legal level likely local main major minor modern natural neat normal novel obvious
  odd official online ordinary original outer perfect personal polite popular positive possible
  private proper public rapid rare recent regular related remote rich royal safe secret senior
  short sincere smart social solid special steady sudden sunny sweet tall tiny total tough typical
  unique useful usual valid various vast visible vital wide wild
  adventure airplane anything apartment backpack backyard baseball basketball bathroom breakfast
  brilliant building butterfly calendar campfire carefully chocolate classroom colorful cucumber
  daughter delicious dinosaur discover distance elevator envelope everybody everything exercise
  favorite festival football friendly frightened furniture goldfish happiness hamburger headphones
  helicopter homework invisible jellyfish kangaroo landscape lemonade lighthouse magazine marathon
  mushroom notebook painting passenger peaceful pineapple playground question raincoat restaurant
  sandwich scissors seashell sidewalk skeleton snowflake squirrel starfish strawberry sunflower
  sunshine surprise telephone treasure umbrella universe vacation vegetable waterfall wonderful
  adjective although applause astronaut audience blueberry boundary bracelet cardboard carpenter
  celebrate certainly character chemistry collection community condition continent crocodile
  curiosity dandelion decorate dictionary direction discovery doorbell downstairs dragonfly
  education electric emergency encourage engineer equipment everywhere excellent excitement
  explorer fireworks fisherman flashlight followed forecast forgotten fragrance gardening generous
  gentleman geography greenhouse guidebook gymnastics hairbrush handshake harmonica hedgehog
  highlight horseback household hurricane including instrument invention kindness knowledge
  laughter lavender lifeguard listening lollipop magnetic meanwhile midnight milkshake molecule
  moonlight motorcycle mysterious necklace newspaper nightfall orchestra overnight paintbrush
  paperwork parachute peppermint perfectly pharmacy photograph pillowcase porcupine postcard
  president princess probably propeller railroad reindeer reporter riverbank sailboat satellite
  saxophone scarecrow scientist shipwreck shoelace silverware skateboard slippers snowstorm
  somewhere spaceship spaghetti spotlight staircase stopwatch storybook submarine suitcase
  sunglasses swimming tablespoon teamwork teaspoon telescope thankful tightrope toothbrush
  toothpaste tortoise traveler trombone tropical typewriter underwater volleyball watermelon
  windmill wildlife wristwatch xylophone yourself zookeeper
  venue lanyard emcee crew usher buffet banquet canape cocktail mocktail dessert catering caterer
  menu brunch gala summit forum seminar keynote breakout booth exhibit exhibitor exhibition sponsor
  sponsorship delegate attendee invitation reception registration checkin concierge valet shuttle
  transfer itinerary timeline rundown rehearsal soundcheck microphone podium lectern lighting
  projector backdrop banner signage decor decoration centerpiece tablecloth napkin cutlery
  glassware ballroom foyer terrace rooftop marquee tent pavilion carpet runway catwalk plaque
  raffle giveaway souvenir hamper voucher networking livestream broadcast photographer videographer
  recording playlist deejay band choir dancer performer magician comedian entertainer hospitality
  housekeeping suite checkout luggage porter bellhop minibar amenities toiletries pillow blanket
  towel balcony refreshments celebration anniversary certificate conference coordinator organizer
  auditorium amphitheater reservation confirmation announcement presentation performance
  appreciation confetti balloons hashtag selfie afterparty headcount waitlist rsvp attire tuxedo
  gown corsage bouquet florist hostess waiter waitress bartender sommelier chef pastry canapes
  appetizer entree platter toast speech encore curtain backstage greenroom ushers wristband clicker
  countdown
`;

export const WORDS: readonly string[] = Object.freeze(LIST.split(/\s+/).filter(Boolean));

/**
 * Two-word slimes for the late run (D815): everyday events and hospitality phrases, typed word by
 * word like a boss's sentence. Lowercase a–z, one space, nothing `obscenity` flags.
 */
const PHRASE_LIST = `
coffee break
guest list
red carpet
door gift
lucky draw
name tag
dress code
photo booth
sound check
goodie bag
welcome drink
floor plan
seating plan
gala dinner
dance floor
grand ballroom
room service
early bird
media wall
opening speech
award night
live band
press kit
buffet line
hotel lobby
shuttle bus
team building
cocktail hour
happy hour
best dressed
main stage
event crew
guest speaker
family day
annual dinner
prize giving
open bar
sweet treats
round table
panel talk
gift bag
group photo
smart casual
black tie
venue tour
kick off
vip table
wrap party
quiz night
thank you
`;

export const PHRASES: readonly (readonly [string, string])[] = Object.freeze(
  PHRASE_LIST.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [a, b] = l.split(" ");
    return Object.freeze([a, b] as const);
  }),
);
