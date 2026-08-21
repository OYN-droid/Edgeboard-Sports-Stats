import { ILLUSTRATION_REGISTRY } from "./illustration-registry.js";
import { EDGEBOARD_ILLUSTRATION_STYLE_VERSION, EDGEBOARD_ILLUSTRATION_V1_PROMPT } from "./illustration-style-v1.js";

export const BASKETBALL_SHOWCASE_BATCH_2_METADATA = Object.freeze({
  id: "edgeboard-illustration-showcase-batch-2-basketball",
  styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  sportId: "basketball",
  requiredTeamCount: 45,
  requiredLeagueCounts: Object.freeze({ nba: 30, wnba: 15 }),
  showcaseRole: "team_representative",
  selectionEffectiveFrom: "2026-08-09",
  rosterVerifiedAt: "2026-08-11T16:00:00.000Z",
  rosterVerificationSource: "Official NBA and WNBA 2026 team and roster pages; NBA production assignments revalidated 2026-08-11",
  selectionDisclosure: "Editorial showcase assignments for production planning; not best-player rankings and replaceable without changing canonical identity.",
  portraitsRequiredBeforeActions: true,
  portraitMode: "standard",
});

// JSON-compatible for the production-readiness report. Assignments are
// replaceable editorial roles and never factual claims that an athlete is best.
const RAW_BASKETBALL_SHOWCASE_SLOTS = /* basketball-showcase-json-start */ [
  {"leagueId":"nba","canonicalAthleteId":"nba-jalen-johnson","displayName":"Jalen Johnson","canonicalTeamId":"NBA-ATL","teamDisplayName":"Atlanta Hawks","position":"Forward","portraitPose":"waist-up three-quarter portrait holding a basketball at the hip","physicalCharacteristics":"tall athletic build, short dark curls, and close facial hair","uniformColorContext":"simplified deep red, charcoal, muted gold, and off-white basketball uniform without logos","actionDescription":"driving with the ball from a strong forward stance"},
  {"leagueId":"nba","canonicalAthleteId":"nba-jayson-tatum","displayName":"Jayson Tatum","canonicalTeamId":"NBA-BOS","teamDisplayName":"Boston Celtics","position":"Forward","portraitPose":"waist-up versatile scorer portrait with the basketball held near the shooting pocket","physicalCharacteristics":"tall athletic build, short dark curls, and a neatly trimmed beard","uniformColorContext":"simplified deep green, warm cream, and black basketball uniform without logos","actionDescription":"sidestep jump shot transitioning into a balanced release"},
  {"leagueId":"nba","canonicalAthleteId":"nba-julius-randle","displayName":"Julius Randle","canonicalTeamId":"NBA-BKN","teamDisplayName":"Brooklyn Nets","position":"Forward-Center","portraitPose":"waist-up strong frontcourt portrait with the basketball secured at chest height","physicalCharacteristics":"powerful broad-shouldered build, close-cropped dark hair, and a full trimmed beard","uniformColorContext":"simplified black, charcoal, and off-white basketball uniform without logos","actionDescription":"shoulder-led power drive into a controlled finish"},
  {"leagueId":"nba","canonicalAthleteId":"nba-brandon-miller","displayName":"Brandon Miller","canonicalTeamId":"NBA-CHA","teamDisplayName":"Charlotte Hornets","position":"Forward","portraitPose":"waist-up poised wing portrait with the basketball resting near one shoulder","physicalCharacteristics":"tall lean build, short dark hair, and light facial hair","uniformColorContext":"simplified teal, purple, charcoal, and off-white basketball uniform without logos","actionDescription":"fluid wing jump shot with a high balanced release"},
  {"leagueId":"nba","canonicalAthleteId":"nba-josh-giddey","displayName":"Josh Giddey","canonicalTeamId":"NBA-CHI","teamDisplayName":"Chicago Bulls","position":"Guard","portraitPose":"waist-up three-quarter playmaker portrait cradling the basketball at waist height","physicalCharacteristics":"tall guard build, swept medium-brown hair, and light facial hair","uniformColorContext":"simplified deep red, black, and off-white basketball uniform without logos","actionDescription":"controlled transition dribble while scanning to pass"},
  {"leagueId":"nba","canonicalAthleteId":"nba-donovan-mitchell","displayName":"Donovan Mitchell","canonicalTeamId":"NBA-CLE","teamDisplayName":"Cleveland Cavaliers","position":"Guard","portraitPose":"waist-up compact guard portrait with the basketball under one arm","physicalCharacteristics":"compact muscular build, close-cropped dark hair, and a full trimmed beard","uniformColorContext":"simplified wine red, muted gold, navy, and off-white basketball uniform without logos","actionDescription":"explosive drive into a one-handed finish"},
  {"leagueId":"nba","canonicalAthleteId":"nba-cooper-flagg","displayName":"Cooper Flagg","canonicalTeamId":"NBA-DAL","teamDisplayName":"Dallas Mavericks","position":"Forward","portraitPose":"waist-up three-quarter portrait holding the basketball with both hands at the waist","physicalCharacteristics":"tall athletic build, short light-brown hair, and clean-shaven youthful features","uniformColorContext":"simplified navy, royal blue, silver-gray, and off-white basketball uniform without logos","actionDescription":"long-stride drive into a two-handed finish"},
  {"leagueId":"nba","canonicalAthleteId":"nba-nikola-jokic","displayName":"Nikola Jokic","canonicalTeamId":"NBA-DEN","teamDisplayName":"Denver Nuggets","position":"Center","portraitPose":"waist-up centered big-player portrait holding the basketball at chest height","physicalCharacteristics":"very tall broad build, short light-brown hair, and clean facial lines","uniformColorContext":"simplified deep navy, muted gold, warm red, and off-white basketball uniform without logos","actionDescription":"high-post passing stance with the ball held securely"},
  {"leagueId":"nba","canonicalAthleteId":"nba-cade-cunningham","displayName":"Cade Cunningham","canonicalTeamId":"NBA-DET","teamDisplayName":"Detroit Pistons","position":"Guard","portraitPose":"waist-up three-quarter lead-guard portrait with the basketball low at one side","physicalCharacteristics":"tall guard build, short dark twists, and close facial hair","uniformColorContext":"simplified royal blue, restrained red, and off-white basketball uniform without logos","actionDescription":"patient change-of-pace dribble into the lane"},
  {"leagueId":"nba","canonicalAthleteId":"nba-stephen-curry","displayName":"Stephen Curry","canonicalTeamId":"GSW","teamDisplayName":"Golden State Warriors","position":"Guard","portraitPose":"waist-up shooting portrait with the basketball set near the chest","physicalCharacteristics":"lean athletic build, close-cropped dark hair, and a trimmed goatee","uniformColorContext":"simplified royal blue, warm gold, and off-white basketball uniform without logos","actionDescription":"compact long-range jump shot at release"},
  {"leagueId":"nba","canonicalAthleteId":"nba-kevin-durant","displayName":"Kevin Durant","canonicalTeamId":"NBA-HOU","teamDisplayName":"Houston Rockets","position":"Forward","portraitPose":"waist-up three-quarter scorer portrait holding the basketball beside the torso","physicalCharacteristics":"exceptionally tall slender build, close-cropped hair, and a full dark beard","uniformColorContext":"simplified deep red, black, and off-white basketball uniform without logos","actionDescription":"high-release pull-up jump shot over an implied defender"},
  {"leagueId":"nba","canonicalAthleteId":"nba-tyrese-haliburton","displayName":"Tyrese Haliburton","canonicalTeamId":"NBA-IND","teamDisplayName":"Indiana Pacers","position":"Guard","portraitPose":"waist-up playmaker portrait with the basketball at the hip and shoulders angled toward court","physicalCharacteristics":"tall lean build, braided dark hair, and light facial hair","uniformColorContext":"simplified deep navy, warm gold, and off-white basketball uniform without logos","actionDescription":"one-handed transition pass from a controlled dribble"},
  {"leagueId":"nba","canonicalAthleteId":"nba-kawhi-leonard","displayName":"Kawhi Leonard","canonicalTeamId":"NBA-LAC","teamDisplayName":"LA Clippers","position":"Forward","portraitPose":"waist-up strong three-quarter portrait gripping the basketball with both hands","physicalCharacteristics":"broad muscular build, tightly braided hair, and a trimmed beard","uniformColorContext":"simplified navy, restrained red, pale blue, and off-white basketball uniform without logos","actionDescription":"low defensive stance with one clear lateral movement axis"},
  {"leagueId":"nba","canonicalAthleteId":"nba-luka-doncic","displayName":"Luka Doncic","canonicalTeamId":"LAL","teamDisplayName":"Los Angeles Lakers","position":"Guard","portraitPose":"waist-up three-quarter playmaker portrait with the basketball tucked at the waist","physicalCharacteristics":"tall strong guard build, short brown hair, and a full trimmed beard","uniformColorContext":"simplified deep purple, warm gold, and off-white basketball uniform without logos","actionDescription":"step-back jump shot with balanced separation"},
  {"leagueId":"nba","canonicalAthleteId":"nba-ja-morant","displayName":"Ja Morant","canonicalTeamId":"NBA-MEM","teamDisplayName":"Memphis Grizzlies","position":"Guard","portraitPose":"waist-up energetic guard portrait holding the basketball low and ready","physicalCharacteristics":"lean explosive build, long dark locs, and light facial hair","uniformColorContext":"simplified deep navy, pale blue, and off-white basketball uniform without logos","actionDescription":"airborne driving finish with believable body alignment"},
  {"leagueId":"nba","canonicalAthleteId":"nba-bam-adebayo","displayName":"Bam Adebayo","canonicalTeamId":"NBA-MIA","teamDisplayName":"Miami Heat","position":"Center-Forward","portraitPose":"waist-up centered frontcourt portrait with the basketball against one hip","physicalCharacteristics":"strong broad-shouldered build, close-cropped hair, and a full trimmed beard","uniformColorContext":"simplified black, deep red, warm orange, and off-white basketball uniform without logos","actionDescription":"powerful defensive stance preparing to switch laterally"},
  {"leagueId":"nba","canonicalAthleteId":"nba-tyler-herro","displayName":"Tyler Herro","canonicalTeamId":"NBA-MIL","teamDisplayName":"Milwaukee Bucks","position":"Guard","portraitPose":"waist-up confident scoring-guard portrait with the basketball in the shooting pocket","physicalCharacteristics":"tall lean guard build, short light-brown hair, and trimmed facial hair","uniformColorContext":"simplified deep green, warm cream, black, and off-white basketball uniform without logos","actionDescription":"controlled pull-up jump shot after one compact dribble"},
  {"leagueId":"nba","canonicalAthleteId":"nba-anthony-edwards","displayName":"Anthony Edwards","canonicalTeamId":"NBA-MIN","teamDisplayName":"Minnesota Timberwolves","position":"Guard","portraitPose":"waist-up confident scorer portrait with the basketball resting beneath one hand","physicalCharacteristics":"powerful athletic build, short dark hair, and close facial hair","uniformColorContext":"simplified deep navy, cool blue, restrained green, and off-white basketball uniform without logos","actionDescription":"explosive airborne finish with a single strong motion arc"},
  {"leagueId":"nba","canonicalAthleteId":"nba-zion-williamson","displayName":"Zion Williamson","canonicalTeamId":"NBA-NOP","teamDisplayName":"New Orleans Pelicans","position":"Forward","portraitPose":"waist-up power-forward portrait holding the basketball firmly at the waist","physicalCharacteristics":"exceptionally powerful broad build, close-cropped dark hair, and clean facial lines","uniformColorContext":"simplified deep navy, restrained red, muted gold, and off-white basketball uniform without logos","actionDescription":"two-foot power finish at the rim"},
  {"leagueId":"nba","canonicalAthleteId":"nba-jalen-brunson","displayName":"Jalen Brunson","canonicalTeamId":"NBA-NYK","teamDisplayName":"New York Knicks","position":"Guard","portraitPose":"waist-up compact lead-guard portrait with the basketball protected at the hip","physicalCharacteristics":"compact strong build, short dark hair, and a neatly trimmed beard","uniformColorContext":"simplified royal blue, warm orange, and off-white basketball uniform without logos","actionDescription":"controlled footwork into a midrange jump shot"},
  {"leagueId":"nba","canonicalAthleteId":"nba-shai-gilgeous-alexander","displayName":"Shai Gilgeous-Alexander","canonicalTeamId":"NBA-OKC","teamDisplayName":"Oklahoma City Thunder","position":"Guard","portraitPose":"waist-up poised scorer portrait with the basketball at one side","physicalCharacteristics":"tall slender build, braided dark hair, and a trimmed beard","uniformColorContext":"simplified bright blue, warm orange, deep navy, and off-white basketball uniform without logos","actionDescription":"smooth change-of-pace drive into a balanced finish"},
  {"leagueId":"nba","canonicalAthleteId":"nba-paolo-banchero","displayName":"Paolo Banchero","canonicalTeamId":"NBA-ORL","teamDisplayName":"Orlando Magic","position":"Forward","portraitPose":"waist-up strong forward portrait with the basketball held at chest height","physicalCharacteristics":"large athletic build, short dark curls, and close facial hair","uniformColorContext":"simplified royal blue, black, silver-gray, and off-white basketball uniform without logos","actionDescription":"shoulder-led drive into a controlled power finish"},
  {"leagueId":"nba","canonicalAthleteId":"nba-tyrese-maxey","displayName":"Tyrese Maxey","canonicalTeamId":"PHI","teamDisplayName":"Philadelphia 76ers","position":"Guard","portraitPose":"waist-up lead-guard portrait with a relaxed forward-facing posture","physicalCharacteristics":"lean athletic build, braided dark hair positioned primarily behind the head, and a characteristic mustache and goatee","uniformColorContext":"simplified royal blue, restrained red, and off-white basketball uniform without logos","actionDescription":"quick first-step drive into a balanced finish"},
  {"leagueId":"nba","canonicalAthleteId":"nba-devin-booker","displayName":"Devin Booker","canonicalTeamId":"NBA-PHX","teamDisplayName":"Phoenix Suns","position":"Guard","portraitPose":"waist-up calm scorer portrait with the basketball near the shooting pocket","physicalCharacteristics":"strong athletic build, short dark hair, and a neatly trimmed beard","uniformColorContext":"simplified deep purple, warm orange, black, and off-white basketball uniform without logos","actionDescription":"balanced midrange pull-up jump shot"},
  {"leagueId":"nba","canonicalAthleteId":"nba-damian-lillard","displayName":"Damian Lillard","canonicalTeamId":"NBA-POR","teamDisplayName":"Portland Trail Blazers","position":"Guard","portraitPose":"waist-up lead-guard portrait with the basketball centered at waist height","physicalCharacteristics":"compact muscular build, close-cropped dark hair, and a full trimmed beard","uniformColorContext":"simplified black, deep red, and off-white basketball uniform without logos","actionDescription":"deep-range jump shot with compact mechanics"},
  {"leagueId":"nba","canonicalAthleteId":"nba-keegan-murray","displayName":"Keegan Murray","canonicalTeamId":"NBA-SAC","teamDisplayName":"Sacramento Kings","position":"Forward","portraitPose":"chest-up standard portrait with a subtle three-quarter shoulder angle and calm focused expression","physicalCharacteristics":"tall athletic build, short dark curls, a neat mustache, and close facial hair","uniformColorContext":"simplified deep purple, black, silver-gray, and off-white basketball jersey context","actionDescription":"balanced catch-and-shoot jump shot"},
  {"leagueId":"nba","canonicalAthleteId":"nba-victor-wembanyama","displayName":"Victor Wembanyama","canonicalTeamId":"NBA-SAS","teamDisplayName":"San Antonio Spurs","position":"Center-Forward","portraitPose":"waist-up elongated frontcourt portrait with the basketball held lightly near one shoulder","physicalCharacteristics":"exceptionally tall slender build, short dark curls, and youthful clean facial structure","uniformColorContext":"simplified black, silver-gray, and off-white basketball uniform without logos","actionDescription":"long-extension defensive contest with anatomically plausible reach"},
  {"leagueId":"nba","canonicalAthleteId":"nba-scottie-barnes","displayName":"Scottie Barnes","canonicalTeamId":"NBA-TOR","teamDisplayName":"Toronto Raptors","position":"Forward","portraitPose":"waist-up versatile forward portrait holding the basketball at the hip","physicalCharacteristics":"tall athletic build, short dark twists, and light facial hair","uniformColorContext":"simplified deep red, black, muted purple, and off-white basketball uniform without logos","actionDescription":"open-court drive with a long controlled stride"},
  {"leagueId":"nba","canonicalAthleteId":"nba-lauri-markkanen","displayName":"Lauri Markkanen","canonicalTeamId":"NBA-UTA","teamDisplayName":"Utah Jazz","position":"Forward-Center","portraitPose":"waist-up tall shooting-forward portrait with the basketball near one shoulder","physicalCharacteristics":"very tall athletic build, short blond hair, and light facial hair","uniformColorContext":"simplified black, warm gold, muted purple, and off-white basketball uniform without logos","actionDescription":"high-release catch-and-shoot jump shot"},
  {"leagueId":"nba","canonicalAthleteId":"nba-trae-young","displayName":"Trae Young","canonicalTeamId":"NBA-WAS","teamDisplayName":"Washington Wizards","position":"Guard","portraitPose":"waist-up playmaking guard portrait with the basketball low at one side","physicalCharacteristics":"slender guard build, short dark curls, and a trimmed beard","uniformColorContext":"simplified deep navy, restrained red, silver-gray, and off-white basketball uniform without logos","actionDescription":"quick dribble into a high-arcing floater"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-angel-reese","displayName":"Angel Reese","canonicalTeamId":"WNBA-ATL","teamDisplayName":"Atlanta Dream","position":"Forward","portraitPose":"waist-up confident forward portrait holding the basketball against one hip","physicalCharacteristics":"tall athletic build, long dark hair, and expressive poised features","uniformColorContext":"simplified deep red, pale blue, navy, and off-white basketball uniform without logos","actionDescription":"strong rebound gather into a controlled finish"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-skylar-diggins","displayName":"Skylar Diggins","canonicalTeamId":"WNBA-CHI","teamDisplayName":"Chicago Sky","position":"Guard","portraitPose":"waist-up poised lead-guard portrait with the basketball at waist height","physicalCharacteristics":"compact athletic build, long dark hair pulled back, and defined facial structure","uniformColorContext":"simplified pale blue, warm gold, deep navy, and off-white basketball uniform without logos","actionDescription":"change-of-pace dribble into a pull-up jump shot"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-brittney-griner","displayName":"Brittney Griner","canonicalTeamId":"WNBA-CON","teamDisplayName":"Connecticut Sun","position":"Center","portraitPose":"waist-up centered post-player portrait holding the basketball at chest height","physicalCharacteristics":"exceptionally tall athletic build, short dark locs, and recognizable facial structure","uniformColorContext":"simplified warm orange, deep navy, and off-white basketball uniform without logos","actionDescription":"two-handed interior finish with a strong vertical axis"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-caitlin-clark","displayName":"Caitlin Clark","canonicalTeamId":"IND-W","teamDisplayName":"Indiana Fever","position":"Guard","portraitPose":"waist-up shooting-guard portrait with the basketball set near the shooting pocket","physicalCharacteristics":"tall lean guard build, long dark hair tied back, and clean youthful facial features","uniformColorContext":"simplified deep navy, restrained red, warm gold, and off-white basketball uniform without logos","actionDescription":"long-range jump shot with balanced compact mechanics"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-sabrina-ionescu","displayName":"Sabrina Ionescu","canonicalTeamId":"NYL","teamDisplayName":"New York Liberty","position":"Guard","portraitPose":"waist-up poised shooting-guard portrait with the basketball set near the shooting pocket","physicalCharacteristics":"tall athletic guard build, long dark hair tied back, and focused defined features","uniformColorContext":"simplified black, seafoam green, warm copper, and off-white basketball uniform without logos","actionDescription":"deep-range jump shot with compact balanced mechanics"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-marina-mabrey","displayName":"Marina Mabrey","canonicalTeamId":"WNBA-TOR","teamDisplayName":"Toronto Tempo","position":"Guard","portraitPose":"waist-up scorer portrait with the basketball near one shoulder","physicalCharacteristics":"tall guard build, medium-brown hair tied back, and focused facial expression","uniformColorContext":"simplified pale blue, deep red, navy, and off-white basketball uniform without logos","actionDescription":"balanced perimeter jump shot at release"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-sonia-citron","displayName":"Sonia Citron","canonicalTeamId":"WNBA-WAS","teamDisplayName":"Washington Mystics","position":"Guard","portraitPose":"waist-up two-way guard portrait holding the basketball at the waist","physicalCharacteristics":"tall athletic build, long brown hair tied back, and clean youthful facial features","uniformColorContext":"simplified deep red, navy, silver-gray, and off-white basketball uniform without logos","actionDescription":"controlled wing drive into a balanced finish"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-paige-bueckers","displayName":"Paige Bueckers","canonicalTeamId":"WNBA-DAL","teamDisplayName":"Dallas Wings","position":"Guard","portraitPose":"waist-up lead-guard portrait with the basketball resting beneath one hand","physicalCharacteristics":"tall lean build, long blond hair tied back, and clean facial features","uniformColorContext":"simplified deep navy, restrained teal, cool blue, and off-white basketball uniform without logos","actionDescription":"smooth change-of-direction dribble into a jump shot"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-gabby-williams","displayName":"Gabby Williams","canonicalTeamId":"WNBA-GSV","teamDisplayName":"Golden State Valkyries","position":"Forward","portraitPose":"waist-up versatile defender portrait with the basketball held at the hip","physicalCharacteristics":"strong athletic build, short dark curls, and defined facial structure","uniformColorContext":"simplified deep violet, black, warm gold, and off-white basketball uniform without logos","actionDescription":"low defensive stance moving into a clean transition dribble"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-aja-wilson","displayName":"A'ja Wilson","canonicalTeamId":"LVA","teamDisplayName":"Las Vegas Aces","position":"Forward","portraitPose":"waist-up dominant frontcourt portrait holding the basketball at chest height","physicalCharacteristics":"tall powerful athletic build, long dark hair, and poised recognizable facial features","uniformColorContext":"simplified black, silver-gray, warm gold, and off-white basketball uniform without logos","actionDescription":"strong face-up drive into an extended finish"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-cameron-brink","displayName":"Cameron Brink","canonicalTeamId":"WNBA-LAS","teamDisplayName":"Los Angeles Sparks","position":"Forward","portraitPose":"waist-up poised frontcourt portrait with the basketball held lightly at chest height","physicalCharacteristics":"very tall lean athletic build, long blond hair tied back, and focused defined features","uniformColorContext":"simplified deep purple, warm gold, black, and off-white basketball uniform without logos","actionDescription":"long-extension defensive contest transitioning into a face-up finish"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-olivia-miles","displayName":"Olivia Miles","canonicalTeamId":"WNBA-MIN","teamDisplayName":"Minnesota Lynx","position":"Guard","portraitPose":"waist-up composed playmaking-guard portrait with the basketball resting at the hip","physicalCharacteristics":"tall guard build, long dark hair tied back, and calm focused features","uniformColorContext":"simplified deep navy, pale blue, restrained green, and off-white basketball uniform without logos","actionDescription":"change-of-pace drive transitioning into a one-handed pass"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-kelsey-plum","displayName":"Kelsey Plum","canonicalTeamId":"WNBA-PHX","teamDisplayName":"Phoenix Mercury","position":"Guard","portraitPose":"waist-up scoring-guard portrait with the basketball in the shooting pocket","physicalCharacteristics":"compact athletic build, long light-brown hair tied back, and focused facial expression","uniformColorContext":"simplified deep purple, warm orange, black, and off-white basketball uniform without logos","actionDescription":"quick perimeter jump shot after one controlled dribble"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-carla-leite","displayName":"Carla Leite","canonicalTeamId":"WNBA-POR","teamDisplayName":"Portland Fire","position":"Guard","portraitPose":"waist-up playmaker portrait with the basketball held low at one side","physicalCharacteristics":"lean guard build, long dark hair tied back, and youthful focused features","uniformColorContext":"simplified deep red, charcoal, warm gold, and off-white basketball uniform without logos","actionDescription":"compact pick-and-roll dribble into a one-handed pass"},
  {"leagueId":"wnba","canonicalAthleteId":"wnba-flaujae-johnson","displayName":"Flau'jae Johnson","canonicalTeamId":"WNBA-SEA","teamDisplayName":"Seattle Storm","position":"Guard","portraitPose":"waist-up confident guard portrait with the basketball resting beneath one hand","physicalCharacteristics":"athletic guard build, long dark braids, and expressive facial features","uniformColorContext":"simplified deep green, warm gold, navy, and off-white basketball uniform without logos","actionDescription":"athletic wing drive into a controlled finish"}
] /* basketball-showcase-json-end */;

const PORTRAIT_STYLE = EDGEBOARD_ILLUSTRATION_V1_PROMPT;
const ACTION_STYLE = "Match the approved portrait exactly in facial structure, build, line hierarchy, shading, and color treatment. Keep one readable action axis, plausible basketball technique, transparent background, restrained motion marks, no logos, no text, and no invented achievement context.";

export const NBA_PRODUCTION_BATCHES = Object.freeze(/* nba-production-batches-json-start */ [
  {"batch":1,"athleteIds":["nba-jayson-tatum","nba-nikola-jokic","nba-anthony-edwards","nba-victor-wembanyama","nba-jalen-brunson","nba-keegan-murray"]},
  {"batch":2,"athleteIds":["nba-jalen-johnson","nba-julius-randle","nba-brandon-miller","nba-donovan-mitchell","nba-cooper-flagg","nba-bam-adebayo"]},
  {"batch":3,"athleteIds":["nba-josh-giddey","nba-cade-cunningham","nba-kevin-durant","nba-kawhi-leonard","nba-ja-morant","nba-paolo-banchero"]},
  {"batch":4,"athleteIds":["nba-tyrese-haliburton","nba-luka-doncic","nba-tyler-herro","nba-zion-williamson","nba-shai-gilgeous-alexander","nba-devin-booker"]},
  {"batch":5,"athleteIds":["nba-tyrese-maxey","nba-damian-lillard","nba-scottie-barnes","nba-lauri-markkanen","nba-trae-young"]}
] /* nba-production-batches-json-end */.map((batch) => Object.freeze({ ...batch, athleteIds: Object.freeze(batch.athleteIds) })));

const NBA_BATCH_BY_ATHLETE = new Map(NBA_PRODUCTION_BATCHES.flatMap((batch) => batch.athleteIds.map((athleteId, index) => [athleteId, Object.freeze({ batch: batch.batch, order: index + 1 })])));
const NBA_POSE_VARIATIONS = Object.freeze([
  "straight-forward gaze with a neutral, composed expression and level shoulders",
  "subtle three-quarter head turn to camera left with a focused expression",
  "subtle three-quarter head turn to camera right with a calm expression",
  "straight-forward gaze with a restrained, characteristic smile",
  "gaze slightly left with a relaxed expression and gentle shoulder angle",
  "gaze slightly right with a focused expression and gentle shoulder angle",
]);

const FEATURED_WNBA_PNG_IDS = new Set([
  "wnba-aja-wilson", "wnba-sabrina-ionescu", "wnba-paige-bueckers", "wnba-angel-reese",
  "wnba-caitlin-clark", "wnba-olivia-miles", "wnba-cameron-brink", "wnba-gabby-williams",
]);

function portraitPath(slot) {
  if (slot.canonicalAthleteId === "nba-stephen-curry") return "assets/illustrations/proof/edgeboard--nba-stephen-curry--portrait--v01.png";
  if (slot.leagueId === "nba") return `assets/illustrations/nba/edgeboard--${slot.canonicalAthleteId}--portrait--v01.png`;
  if (FEATURED_WNBA_PNG_IDS.has(slot.canonicalAthleteId)) return `assets/illustrations/athletes/edgeboard--${slot.canonicalAthleteId}--portrait--v01.png`;
  return `assets/illustrations/athletes/edgeboard--${slot.canonicalAthleteId}--portrait--v01.svg`;
}

function actionPath(slot) {
  return `assets/illustrations/athletes/edgeboard--${slot.canonicalAthleteId}--action--v01.svg`;
}

function buildSlot(slot, slotIndex) {
  const portraitAssetPath = portraitPath(slot);
  const actionAssetPathPlaceholder = actionPath(slot);
  const activeExact = ILLUSTRATION_REGISTRY.find((entry) => entry.status === "active" && entry.entityType === "athlete" && entry.canonicalEntityId === slot.canonicalAthleteId && entry.variant === "portrait");
  const nbaBatch = NBA_BATCH_BY_ATHLETE.get(slot.canonicalAthleteId) || null;
  const poseVariation = NBA_POSE_VARIATIONS[slotIndex % NBA_POSE_VARIATIONS.length];
  const registryDraft = activeExact ? Object.freeze({ ...activeExact, status: "active_existing_reference" }) : Object.freeze({
    id: `art-${slot.canonicalAthleteId}-portrait`, entityType: "athlete",
    canonicalEntityId: slot.canonicalAthleteId, sport: "basketball", league: slot.leagueId,
    teamId: slot.canonicalTeamId, assetPath: portraitAssetPath,
    assetType: "original_manual", variant: "portrait", priority: 90,
    fallbackGroup: `team:${slot.canonicalTeamId}`, status: "planned",
    source: "edgeboard_original", altText: `${slot.displayName} editorial illustration`, styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
  });
  return Object.freeze({
    ...slot,
    styleVersion: EDGEBOARD_ILLUSTRATION_STYLE_VERSION,
    showcaseRole: "team_representative",
    portraitAssetPath,
    actionAssetPathPlaceholder,
    productionStatus: activeExact ? "approved" : slot.leagueId === "nba" ? "awaiting_asset" : "not_started",
    generationStatus: activeExact ? "approved_existing" : slot.leagueId === "nba" ? "awaiting_asset" : "not_started",
    actionGenerationStatus: "deferred_until_all_portraits_complete",
    reviewStatus: activeExact ? "approved" : "not_submitted",
    identityReferenceReviewStatus: activeExact ? "approved_existing" : "required_before_generation",
    sourceType: activeExact ? "edgeboard_original_existing" : "edgeboard_original_planned",
    selectionEffectiveFrom: BASKETBALL_SHOWCASE_BATCH_2_METADATA.selectionEffectiveFrom,
    fallback: Object.freeze({
      hierarchy: Object.freeze(["exact_athlete", "team", "generic_basketball", "neutral"]),
      currentExpectedLevel: activeExact ? "exact" : "team",
      teamFallbackRegistryId: `art-team-${slot.canonicalTeamId.toLowerCase()}`,
      basketballFallbackRegistryId: "art-generic-basketball",
      neutralFallbackRegistryId: "art-placeholder-neutral",
    }),
    portraitMode: "standard",
    productionBatch: nbaBatch?.batch || null,
    productionOrder: nbaBatch?.order || null,
    poseVariation,
    portraitPrompt: slot.leagueId === "nba"
      ? `Create one original EdgeBoard NBA standard roster portrait of ${slot.displayName} (canonical athlete ID: ${slot.canonicalAthleteId}), the replaceable ${slot.teamDisplayName} representative and an NBA ${slot.position}. Output target: ${portraitAssetPath}. Produce a single athlete in standard portrait mode, chest/upper-torso crop, head fully visible, shoulders visible, comparable roster scale, natural posture, and ${poseVariation}. Use an 8-bit RGBA, non-interlaced PNG at exactly 640 × 800 with meaningful genuine alpha transparency and no baked background. Preserve recognizable athlete-specific appearance: ${slot.physicalCharacteristics}; confirm current hairstyle, facial hair, and only genuinely characteristic game-day accessories from an approved factual identity reference package. Do not add a headband, sleeve, jewelry, tattoos, or other accessories unless athlete-specific and visible in this crop. Jersey context: ${slot.uniformColorContext}; establish current team identity through colors, neckline, shoulder treatment, restrained wordmark/number context where appropriate, without letting sponsor marks or micro-detail overpower the athlete. Match EdgeBoard Illustration Style v1 (${EDGEBOARD_ILLUSTRATION_STYLE_VERSION}): clearly illustrated cartoon-editorial rendering, intentionally non-photorealistic, bold controlled outer outlines, controlled facial linework, simplified facial planes, restrained cel shading, clean color blocks, limited highlights, minimal photographic skin texture, simplified but recognizable hair and facial-hair rendering, natural proportions, strong likeness, and polished sports-editorial readability. Do not reproduce or trace a photograph or existing artwork. No action pose, no shooting, dunking, dribbling, driving, or defensive stance; no basketball in hand; no arena, crowd, scenery, trading-card frame, checkerboard, glow, poster effects, or opaque background. ${PORTRAIT_STYLE}`
      : `Create an original standard editorial portrait of ${slot.displayName}, a current ${slot.leagueId.toUpperCase()} ${slot.position} assigned as the replaceable ${slot.teamDisplayName} team representative. Use a non-action chest/upper-torso composition with natural posture and no dribbling, shooting, driving, dunking, or defensive action pose. Recognizable production characteristics to confirm against an approved factual reference package: ${slot.physicalCharacteristics}. Uniform context: ${slot.uniformColorContext}. Do not reproduce or trace any existing photograph or artwork. ${PORTRAIT_STYLE}`,
    actionPrompt: `After all 45 portraits are approved, create an optional original action variant of ${slot.displayName}, ${slot.leagueId.toUpperCase()} ${slot.position}: ${slot.actionDescription}. Do not reproduce or trace an existing photograph. ${ACTION_STYLE}`,
    registryDraft,
  });
}

export const BASKETBALL_SHOWCASE_BATCH_2 = Object.freeze(RAW_BASKETBALL_SHOWCASE_SLOTS.map(buildSlot));
export const NBA_SHOWCASE_BATCH_2 = Object.freeze(BASKETBALL_SHOWCASE_BATCH_2.filter((slot) => slot.leagueId === "nba"));
export const WNBA_SHOWCASE_BATCH_2 = Object.freeze(BASKETBALL_SHOWCASE_BATCH_2.filter((slot) => slot.leagueId === "wnba"));

export function validateNBAIllustrationReadiness(entries = NBA_SHOWCASE_BATCH_2, { canonicalEntities = [], illustrationEntries = ILLUSTRATION_REGISTRY } = {}) {
  const errors = [];
  const athleteById = new Map(canonicalEntities.filter((entity) => entity.entityType !== "team").map((entity) => [entity.id, entity]));
  const teamById = new Map(canonicalEntities.filter((entity) => entity.entityType === "team" && entity.leagueId === "nba").map((entity) => [entity.id, entity]));
  const activeExactIds = new Set(illustrationEntries.filter((entry) => entry.status === "active" && entry.entityType === "athlete" && entry.league === "nba" && entry.variant === "portrait").map((entry) => entry.canonicalEntityId));
  const athleteIds = new Set(entries.map((entry) => entry.canonicalAthleteId));
  const teamIds = new Set(entries.map((entry) => entry.canonicalTeamId));
  const targetPaths = new Set(entries.map((entry) => entry.portraitAssetPath));
  const pending = entries.filter((entry) => entry.canonicalAthleteId !== "nba-stephen-curry");
  const batchedIds = NBA_PRODUCTION_BATCHES.flatMap((batch) => batch.athleteIds);

  if (entries.length !== 30) errors.push(`Expected 30 NBA representatives; received ${entries.length}.`);
  if (teamById.size !== 30) errors.push(`Expected 30 canonical NBA teams; received ${teamById.size}.`);
  if (athleteIds.size !== 30) errors.push("NBA representative athlete IDs must be unique.");
  if (teamIds.size !== 30) errors.push("NBA representative team IDs must be unique.");
  if (targetPaths.size !== 30) errors.push("NBA portrait target paths must be unique.");
  if (NBA_PRODUCTION_BATCHES.length !== 5 || NBA_PRODUCTION_BATCHES.map((batch) => batch.athleteIds.length).join(",") !== "6,6,6,6,5") errors.push("NBA production batches must contain 6, 6, 6, 6, and 5 athletes.");
  if (batchedIds.length !== 29 || new Set(batchedIds).size !== 29 || batchedIds.includes("nba-stephen-curry")) errors.push("NBA production batches must contain each pending athlete exactly once and exclude Stephen Curry.");
  if (pending.some((entry) => !batchedIds.includes(entry.canonicalAthleteId))) errors.push("Every pending NBA representative must have a production batch.");
  for (const entry of entries) {
    const athlete = athleteById.get(entry.canonicalAthleteId);
    const team = teamById.get(entry.canonicalTeamId);
    if (!athlete || athlete.teamId !== entry.canonicalTeamId || athlete.leagueId !== "nba") errors.push(`Canonical NBA athlete mapping missing or inconsistent: ${entry.canonicalAthleteId}.`);
    if (!team || team.sportId !== "basketball") errors.push(`Canonical NBA team mapping missing or inconsistent: ${entry.canonicalTeamId}.`);
    if (entry.styleVersion !== EDGEBOARD_ILLUSTRATION_STYLE_VERSION || entry.portraitMode !== "standard") errors.push(`NBA style contract mismatch: ${entry.canonicalAthleteId}.`);
    if (!entry.portraitPrompt.includes(entry.canonicalAthleteId) || !entry.portraitPrompt.includes(entry.portraitAssetPath) || !entry.portraitPrompt.includes("640 × 800") || !entry.portraitPrompt.includes("alpha transparency") || !entry.portraitPrompt.includes("non-photorealistic") || !entry.portraitPrompt.includes("No action pose")) errors.push(`NBA final prompt incomplete: ${entry.canonicalAthleteId}.`);
    if (!illustrationEntries.some((fallback) => fallback.id === entry.fallback.teamFallbackRegistryId) || !illustrationEntries.some((fallback) => fallback.id === entry.fallback.basketballFallbackRegistryId) || !illustrationEntries.some((fallback) => fallback.id === entry.fallback.neutralFallbackRegistryId)) errors.push(`NBA fallback chain incomplete: ${entry.canonicalAthleteId}.`);
    if (entry.canonicalAthleteId === "nba-stephen-curry") {
      if (!activeExactIds.has(entry.canonicalAthleteId) || entry.productionStatus !== "approved" || entry.reviewStatus !== "approved" || entry.portraitAssetPath !== "assets/illustrations/proof/edgeboard--nba-stephen-curry--portrait--v01.png") errors.push("Stephen Curry must remain the approved exact NBA portrait at its existing proof path.");
    } else if ([1, 2, 3, 4, 5].includes(entry.productionBatch)) {
      if (!activeExactIds.has(entry.canonicalAthleteId) || entry.productionStatus !== "approved" || entry.reviewStatus !== "approved" || entry.registryDraft.status !== "active_existing_reference") errors.push(`NBA production Batch ${entry.productionBatch} portrait must be approved and active: ${entry.canonicalAthleteId}.`);
    } else if (activeExactIds.has(entry.canonicalAthleteId) || entry.productionStatus !== "awaiting_asset" || entry.generationStatus !== "awaiting_asset" || entry.reviewStatus !== "not_submitted" || entry.registryDraft.status !== "planned" || !entry.portraitAssetPath.startsWith("assets/illustrations/nba/") || !entry.portraitAssetPath.endsWith("--portrait--v01.png")) {
      errors.push(`Pending NBA portrait must remain inactive and awaiting asset: ${entry.canonicalAthleteId}.`);
    }
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    required: 30,
    assigned: entries.length,
    uniqueAthletes: athleteIds.size,
    uniqueTeams: teamIds.size,
    uniqueTargetPaths: targetPaths.size,
    approvedExact: entries.filter((entry) => entry.productionStatus === "approved").length,
    pending: entries.filter((entry) => entry.productionStatus === "awaiting_asset").length,
    fallbackCovered: entries.filter((entry) => entry.fallback?.hierarchy?.length === 4).length,
    productionBatches: NBA_PRODUCTION_BATCHES.length,
    promptsReady: pending.filter((entry) => entry.portraitPrompt).length,
  });
}

export function validateBasketballShowcaseBatch(entries = BASKETBALL_SHOWCASE_BATCH_2, { canonicalEntities = [], illustrationEntries = ILLUSTRATION_REGISTRY } = {}) {
  const errors = [];
  const athletes = new Map(canonicalEntities.filter((entity) => entity.entityType !== "team").map((entity) => [entity.id, entity]));
  const teams = new Map(canonicalEntities.filter((entity) => entity.entityType === "team").map((entity) => [entity.id, entity]));
  const registryIds = new Set(illustrationEntries.map((entry) => entry.id));
  const athleteIds = new Set(entries.map((entry) => entry.canonicalAthleteId));
  const teamIds = new Set(entries.map((entry) => entry.canonicalTeamId));
  const leagueCounts = entries.reduce((counts, entry) => ({ ...counts, [entry.leagueId]: (counts[entry.leagueId] || 0) + 1 }), {});

  if (entries.length !== 45) errors.push(`Expected 45 basketball showcase slots; received ${entries.length}.`);
  if (leagueCounts.nba !== 30) errors.push(`Expected 30 NBA slots; received ${leagueCounts.nba || 0}.`);
  if (leagueCounts.wnba !== 15) errors.push(`Expected 15 WNBA slots; received ${leagueCounts.wnba || 0}.`);
  if (athleteIds.size !== entries.length) errors.push("Basketball showcase athlete IDs must be unique.");
  if (teamIds.size !== entries.length) errors.push("Basketball showcase team IDs must be unique.");
  for (const entry of entries) {
    const athlete = athletes.get(entry.canonicalAthleteId);
    const team = teams.get(entry.canonicalTeamId);
    if (!athlete || athlete.teamId !== entry.canonicalTeamId || athlete.leagueId !== entry.leagueId) errors.push(`Canonical athlete mapping missing or inconsistent: ${entry.canonicalAthleteId}.`);
    if (!team || team.leagueId !== entry.leagueId || team.sportId !== "basketball") errors.push(`Canonical team mapping missing or inconsistent: ${entry.canonicalTeamId}.`);
    if (!registryIds.has(entry.fallback.teamFallbackRegistryId)) errors.push(`Team fallback missing: ${entry.fallback.teamFallbackRegistryId}.`);
    if (!entry.portraitPrompt || !entry.actionPrompt || !entry.portraitAssetPath || !entry.actionAssetPathPlaceholder) errors.push(`Production description incomplete: ${entry.canonicalAthleteId}.`);
    if (entry.showcaseRole !== "team_representative") errors.push(`Invalid showcase role: ${entry.canonicalAthleteId}.`);
    if (entry.registryDraft.status === "planned" && registryIds.has(entry.registryDraft.id)) errors.push(`Planned registry row is already active: ${entry.registryDraft.id}.`);
  }
  for (const required of ["art-generic-basketball", "art-placeholder-neutral"]) if (!registryIds.has(required)) errors.push(`Shared fallback missing: ${required}.`);
  return Object.freeze({
    valid: errors.length === 0, errors: Object.freeze(errors), required: 45,
    assigned: entries.length, uniqueAthletes: athleteIds.size, uniqueTeams: teamIds.size,
    nbaAssigned: leagueCounts.nba || 0, wnbaAssigned: leagueCounts.wnba || 0,
    portraitPrompts: entries.filter((entry) => entry.portraitPrompt).length,
    deferredActionPrompts: entries.filter((entry) => entry.actionGenerationStatus === "deferred_until_all_portraits_complete").length,
    registryReady: entries.filter((entry) => ["planned", "active_existing_reference"].includes(entry.registryDraft.status)).length,
    exactActive: entries.filter((entry) => entry.generationStatus === "approved_existing").length,
  });
}
