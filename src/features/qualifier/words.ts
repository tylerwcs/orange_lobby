// The words of a typing-qualifier run (D767): common English, lowercase a–z only, no
// proper nouns, nothing `obscenity` flags (tests/qualifier/words.test.ts checks all of it).
// English only, like every live game.
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
`;

export const WORDS: readonly string[] = Object.freeze(LIST.split(/\s+/).filter(Boolean));

/** Rerolls allowed when a draw equals the word before it, then the draw stands. */
const MAX_REROLLS = 8;

/**
 * `n` words for a run, picked with replacement. A word is never drawn twice in a row: an
 * immediate repeat is re-rolled (a bounded number of times, so a stuck `rand` can't loop).
 * `rand` is injectable for tests and returns [0, 1).
 */
export function drawWords(n: number, rand: () => number = Math.random): string[] {
  const out: string[] = [];
  const pick = () => WORDS[Math.min(WORDS.length - 1, Math.max(0, Math.floor(rand() * WORDS.length)))];
  for (let i = 0; i < n; i++) {
    let w = pick();
    for (let r = 0; r < MAX_REROLLS && i > 0 && w === out[i - 1]; r++) w = pick();
    out.push(w);
  }
  return out;
}
