/**
 * Ten Candles rules as this play aid runs them, each in our own words with
 * how sure we are. There is no free official rules text: the publisher's
 * site has no quickstart or preview, so nothing here is confirmed against
 * the book. "corroborated" means several independent fan references and
 * reviews agree; "disputed" means they disagree (and the GM picks, in the
 * settings); "inferred" means one source or a reading between the lines.
 * The UI marks anything that isn't corroborated. docs/SYSTEMS.md lists the
 * same rules with links. If you own the book, check these against it.
 */

export type Confidence = "corroborated" | "disputed" | "inferred";

export const SOURCES = {
  wikipedia: { title: "Wikipedia: Ten Candles", url: "https://en.wikipedia.org/wiki/Ten_Candles" },
  cheatography: { title: "Cheatography: 10 Candles cheat sheet (bunnycrazy)", url: "https://cheatography.com/bunnycrazy/cheat-sheets/10-candles/" },
  gist: { title: "Riobe's Ten Candles cheat sheet (GitHub gist)", url: "https://gist.github.com/Riobe/f0915c86c5254dfe5bdf24e437d0a32f" },
  meeple: { title: "My Kind of Meeple: Ten Candles review", url: "https://mykindofmeeple.com/ten-candles-rpg-review/" },
  susd: { title: "Shut Up & Sit Down: Ten Candles review", url: "https://www.shutupandsitdown.com/review-ten-candles/" },
  fistful: { title: "Fistful of Coppers: Ten Candles", url: "https://fistfulofcoppers.com/ten-candles/" },
  ppd: { title: "Pen, Paper & Dice: review of Ten Candles", url: "https://pen-paper-dice.de/en/reviews/ttrpg-reviews/review-of-ten-candles/" },
  rancourt: { title: "Rancourt: Review — Ten Candles", url: "https://rancourt.substack.com/p/review-ten-candles" },
  diymfa: { title: "DIY MFA: Doom and hope in Ten Candles", url: "https://diymfa.com/writing/doom-hope-ten-candles" },
  gpg: { title: "Gameplay Gather: Ten Candles, light in a dying world", url: "https://gameplaygather.substack.com/p/ten-candles-light-in-a-dying-world" },
  adept: { title: "Adept Play: Ten Candles, sympathy and science", url: "https://adeptplay.com/2022/06/07/ten-candles-sympathy-and-science/" },
  illusory: { title: "Illusory Script: Ten Candles tips", url: "https://illusoryscript.com/ten-candles-tips/" },
  alexandrian: { title: "The Alexandrian: Ten Candles review", url: "https://thealexandrian.net/wordpress/38589/roleplaying-games/ten-candles" },
  foundry: { title: "Foundry VTT: Ten Candles system (unofficial)", url: "https://foundryvtt.com/packages/tencandles" },
  luciellaes: { title: "Luciellaes: RPG review #1, Ten Candles", url: "https://luciellaes.wordpress.com/2019/09/13/rpg-review-1-ten-candles/" },
  publisher: { title: "Cavalry Games: Ten Candles", url: "https://cavalrygames.com/ten-candles-info" },
} as const;
export type SourceKey = keyof typeof SOURCES;

export interface Rule {
  /** What the play aid does, in our own words. */
  text: string;
  confidence: Confidence;
  sources: SourceKey[];
  /** For disputed rules: what the other reading is, and the setting that picks between them. */
  dispute?: string;
}

export const RULES = {
  pools: {
    text: "Players share one pool of six-sided dice, one die for each lit candle. The GM's pool is one die for each dark candle. Both pools reset when a scene starts.",
    confidence: "corroborated",
    sources: ["cheatography", "gist", "meeple", "alexandrian", "ppd"],
  },
  success: {
    text: "A roll succeeds if any die shows a 6.",
    confidence: "corroborated",
    sources: ["cheatography", "rancourt", "alexandrian", "ppd"],
  },
  ones: {
    text: "Every die that shows a 1 is set aside for the rest of the scene, so the players' pool shrinks as the scene goes on.",
    confidence: "corroborated",
    sources: ["cheatography", "rancourt", "alexandrian", "ppd"],
  },
  onesToGm: {
    text: "Players' 1s just leave the pool.",
    confidence: "disputed",
    sources: ["susd", "foundry"],
    dispute: "A few sources hand the lost dice to the GM's pool for the scene. Setting: \"1s go to the GM\".",
  },
  narration: {
    text: "The GM rolls their pool at the same time. If the player succeeds with more 6s than the GM, the player says what happens. On a tie or fewer 6s it's still a success, but the GM says how.",
    confidence: "corroborated",
    sources: ["rancourt", "cheatography", "fistful", "meeple"],
  },
  seize: {
    text: "When the GM wins the telling of a success, a player may darken a candle to tell it themselves. That ends the scene.",
    confidence: "corroborated",
    sources: ["rancourt", "luciellaes"],
  },
  failure: {
    text: "A roll with no 6s fails: a candle is darkened and the scene ends. The GM says what went wrong.",
    confidence: "corroborated",
    sources: ["cheatography", "meeple", "gpg", "wikipedia"],
  },
  accidental: {
    text: "A real candle that goes out on its own also ends the scene. Candles are never relit.",
    confidence: "corroborated",
    sources: ["wikipedia", "cheatography"],
  },
  truths: {
    text: "When a new scene starts, the GM opens with the line \"These things are true. The world is dark.\" Then truths go round the table, the GM included, one each. Count them so the total, with the closing line, equals the lit candles. The last truth is always \"and we are alive\", said together.",
    confidence: "corroborated",
    sources: ["cheatography", "rancourt", "diymfa", "ppd", "fistful"],
  },
  truthLimits: {
    text: "A truth states one fact. It can build on earlier truths but can't contradict them, and it can't give Them a weakness.",
    confidence: "corroborated",
    sources: ["cheatography", "diymfa", "rancourt"],
  },
  truthStarter: {
    text: "Truths start with the player whose roll darkened the candle, then go clockwise.",
    confidence: "disputed",
    sources: ["cheatography", "ppd", "rancourt"],
    dispute: "Some sources start with the player on the GM's left instead. Setting: \"truths start with\".",
  },
  firstScene: {
    text: "The first scene starts straight after character creation, without a round of truths.",
    confidence: "inferred",
    sources: ["rancourt", "cheatography"],
    dispute: "Inferred from the count of truths a game is said to have. Setting: \"truths before the first scene\".",
  },
  creation: {
    text: "Character creation goes: traits (light three candles), the GM reads the module, concepts, moments (light three), brinks (light three), arrange the stacks, light the tenth candle, then record.",
    confidence: "corroborated",
    sources: ["cheatography", "gist"],
  },
  traits: {
    text: "Each player writes a Virtue and a Vice. The Virtue goes to the player on their right and the Vice to the player on their left, so you play traits your neighbours gave you.",
    confidence: "disputed",
    sources: ["wikipedia", "meeple", "susd", "fistful", "gist"],
    dispute: "Some fan sheets (Cheatography) pass the Virtue left and the Vice right instead. Setting: \"Virtues go\".",
  },
  moments: {
    text: "Each player writes their own Moment: something they'd find hope in, which could happen tonight and could fail.",
    confidence: "corroborated",
    sources: ["cheatography", "gist", "diymfa"],
  },
  brinks: {
    text: "Each player writes a Brink for the player on their left: something they've seen that character do. The GM writes one for the player on the GM's left, as if They saw it. The player on the GM's right writes one for Them instead: something about Their strength, never a weakness.",
    confidence: "corroborated",
    sources: ["cheatography", "gist", "wikipedia"],
  },
  stack: {
    text: "Each player stacks Virtue, Vice and Moment in the order they choose, with the Brink always at the bottom. The order can't change later, and only the top card can be used.",
    confidence: "corroborated",
    sources: ["cheatography", "gist", "diymfa"],
  },
  brinkSecret: {
    text: "Your Brink sits face down at the bottom of your stack. This aid lets you read it on your phone, and nobody else but its writer and the GM.",
    confidence: "inferred",
    sources: ["cheatography", "gist"],
    dispute: "Sources call the Brink hidden but don't say whether its owner may read it early.",
  },
  burn: {
    text: "After a roll, if the top card is a Virtue or Vice, you may burn it, using it in the story, to reroll every die that came up 1.",
    confidence: "corroborated",
    sources: ["cheatography", "wikipedia", "rancourt", "diymfa"],
  },
  moment: {
    text: "With your Moment on top, living it is a roll. Success gives you a Hope die. The Moment card burns either way.",
    confidence: "corroborated",
    sources: ["cheatography", "diymfa", "meeple", "wikipedia"],
  },
  hope: {
    text: "The Hope die is yours alone and joins your rolls. It succeeds on a 5 or a 6 and isn't lost to a 1. Only a 6 on it counts toward winning the telling.",
    confidence: "corroborated",
    sources: ["cheatography", "diymfa", "fistful", "gist"],
    dispute: "Whether a 5 on the Hope die counts toward the telling is from one source only.",
  },
  brink: {
    text: "With only your Brink left, you may embrace it after a roll to reroll the whole pool. If it works, you keep the Brink and can embrace it again. If it fails, the Brink burns and you lose your Hope die.",
    confidence: "corroborated",
    sources: ["cheatography", "gist", "rancourt", "fistful"],
  },
  brinkWhen: {
    text: "A Brink can be embraced after any roll.",
    confidence: "disputed",
    sources: ["gist", "cheatography"],
    dispute: "Others allow it only after a roll that failed. Setting: \"Brinks can be embraced\".",
  },
  lastStand: {
    text: "When one candle is left, the Last Stand starts: the truths are just the opening line and \"and we are alive\", the pool is one die plus Hope dice, and a failed roll kills the character instead of darkening the candle. The game ends when the last character dies or the last candle goes out.",
    confidence: "corroborated",
    sources: ["wikipedia", "ppd", "gpg", "fistful"],
  },
  dying: {
    text: "Before the Last Stand nobody dies unless their player chooses it. After a failed roll a player may let their character die there.",
    confidence: "corroborated",
    sources: ["gist", "rancourt", "gpg"],
  },
  martyr: {
    text: "A character who dies saving someone may give their Hope die to another character.",
    confidence: "inferred",
    sources: ["gist"],
  },
  recording: {
    text: "Before play, each player records a short message in character, to be found after.",
    confidence: "corroborated",
    sources: ["cheatography", "meeple", "gpg", "adept", "illusory"],
  },
  playback: {
    text: "The recordings play at the very end, in the dark, after the last candle.",
    confidence: "disputed",
    sources: ["meeple", "gpg", "adept", "ppd"],
    dispute: "One review plays each recording when that character dies. Setting: \"recordings play\".",
  },
} satisfies Record<string, Rule>;

export type RuleId = keyof typeof RULES;

/** The disputed and inferred rules, which the GM can switch. Defaults follow the majority reading. */
export interface TcSettings {
  /** Which neighbour receives the Virtue you write (the Vice goes the other way). */
  virtueTo: "right" | "left";
  /** Players' 1s go to the GM's pool for the scene. */
  onesToGm: boolean;
  /** Who states the first truth of a scene. */
  truthStarter: "active" | "gmLeft";
  /** When a Brink can be embraced. */
  brinkWhen: "any" | "failed";
  /** When the final recordings are heard. */
  playback: "end" | "onDeath";
  /** A round of truths before the first scene too. */
  firstSceneTruths: boolean;
  /** Keep recordings on the server (small, capped) so the GM can play them. Off: they stay on each phone. */
  keepRecordings: boolean;
  /**
   * Candles on the screen burn down like real ones: each gets a burn time
   * between these many minutes when it's lit, and goes out when it's spent.
   * 0 turns burning off (a table with real candles, where the GM taps to match).
   */
  burnMin: number;
  burnMax: number;
  /** Drafts: how often, on average, a draft makes a candle sputter (the GM decides whether it goes out). 0 = never. */
  draftsPerHour: number;
}

export const DEFAULT_SETTINGS: TcSettings = {
  virtueTo: "right",
  onesToGm: false,
  truthStarter: "active",
  brinkWhen: "any",
  playback: "end",
  firstSceneTruths: false,
  keepRecordings: false,
  burnMin: 120,
  burnMax: 180,
  draftsPerHour: 1,
};

/** Which rule each setting picks a reading of, for the "unconfirmed" markers. */
export const SETTING_RULE: Record<keyof TcSettings, RuleId | null> = {
  virtueTo: "traits",
  onesToGm: "onesToGm",
  truthStarter: "truthStarter",
  brinkWhen: "brinkWhen",
  playback: "playback",
  firstSceneTruths: "firstScene",
  keepRecordings: null,
  burnMin: null,
  burnMax: null,
  draftsPerHour: null,
};

/** Fixed lines the table says. Short phrases, as the game has them. */
export const OPENING_LINE = "These things are true. The world is dark.";
export const CLOSING_LINE = "and we are alive";

/** How many candles there are. */
export const CANDLES = 10;
