import type { RngState } from "./rng";

export type Era = "1990s" | "2000s" | "today";

export type FameTier = "Unknown" | "Working" | "Known" | "A-list" | "Icon";
export type Medium = "Film" | "TV" | "Both";
export type SeriesDealStyle = "single" | "guaranteed" | "option";
export type PilotStatus = "shooting" | "awaiting" | "picked_up" | "passed" | "retooled";
export type LedgerBucket = "film" | "series" | "pilot" | "bonus" | "overhead" | "other";
export type CareerStage = "Newcomer" | "Rising" | "Peak" | "Established" | "Declining" | "Comeback";
export type Mood = "Thrilled" | "Content" | "Uneasy" | "Unhappy" | "Furious";
export type WorkStatus = "AVAILABLE" | "IN_PREP" | "SHOOTING" | "POST_PRODUCTION" | "AIRING";
export type AgencySide = "player" | "rival" | "unsigned";
export type BudgetTier = "micro-indie" | "indie" | "mid" | "studio" | "tentpole";
export type RoleType =
  | "Lead"
  | "Co-lead"
  | "Supporting"
  | "Cameo"
  | "Series Regular"
  | "Recurring"
  | "Guest Star";
export type SeriesFormat =
  | "limited"
  | "ongoing_drama"
  | "sitcom"
  | "streaming"
  | "miniseries"
  | "anthology";
export type ReleaseSchedule = "weekly" | "binge";
export type ProfitLabel = "blockbuster" | "hit" | "modest" | "disappointment" | "flop" | "bomb";
export type StaffRole = "junior_agent" | "scout" | "publicist" | "lawyer";
export type AgencyTier = "Boutique" | "Rising" | "Established" | "Major" | "Powerhouse";
export type Preference = "prestige" | "commercial" | "none";
export type VerdictLabel = "Loved" | "Liked" | "Mixed" | "Disliked" | "Regretted";
export type RenewalOutcome = "renewed" | "renewed_short" | "cancelled" | "finale" | "pending";

export type GameDate = { year: number; week: number };

export type RealCredit = {
  title: string;
  year: string;
  character: string;
  rating: number;
  mediaType: string;
};

export type CreditSide = {
  count: number;
  avgRating: number;
  recent: number;
  titles: { title: string; year: string; rating: number }[];
};

export type CatalogPerson = {
  id: number;
  name: string;
  department: "Acting" | "Directing";
  profilePath: string | null;
  birthday: string | null;
  deathday: string | null;
  gender: number;
  popularity: number;
  nationality: string | null;
  placeOfBirth: string | null;
  creditCount: number;
  avgRating: number;
  genreMix: Record<string, number>;
  knownFor: RealCredit[];
  movieCredits?: CreditSide;
  tvCredits?: CreditSide;
};

export type Catalog = {
  actors: CatalogPerson[];
  directors: CatalogPerson[];
};

export type HiddenTraits = {
  ambition: number;
  loyalty: number;
  greed: number;
  prestigeVsMoney: number;
  riskAppetite: number;
};

export type ActorStats = {
  talent: number;
  starPower: number;
  marketability: number;
  range: number;
  buzz: number;
  reputation: number;
};

export type Contract = {
  commission: number;
  start: GameDate;
  termYears: number;
  exclusive: boolean;
  exitClause: boolean;
};

export type Verdict = {
  id: string;
  projectId: string;
  projectTitle: string;
  when: GameDate;
  phase: "wrap" | "release" | "season";
  stars: number;
  label: VerdictLabel;
  text: string;
};

export type Client = {
  personId: number;
  name: string;
  profilePath: string | null;
  gender: number;
  nationality: string | null;
  birthday: string | null;
  deathday: string | null;
  preferredGenres: string[];
  stats: ActorStats;
  statWhy: Record<keyof ActorStats, string>;
  traits: HiddenTraits;
  revealedHints: string[];
  fame: FameTier;
  careerStage: CareerStage;
  mood: Mood;
  loyalty: number;
  agency: AgencySide;
  rivalId: string | null;
  contract: Contract | null;
  history: { year: number; week: number; score: number }[];
  awards: {
    ceremony: string;
    category: string;
    result: "nominated" | "won";
    year: number;
    projectTitle: string;
  }[];
  verdicts: Verdict[];
  nextPreference: Preference;
  realCredits: RealCredit[];
  studioHeat: Record<string, number>;
  overrides: number;
  unhappyStreak: number;
  medium: Medium;
  filmStar: number;
  tvStar: number;
  filmPrestige: number;
  tvPrestige: number;
  franchises: FranchiseLock[];
};

export type Review = {
  outlet: string;
  score: number;
  text: string;
  actorId?: number;
  actorName?: string;
};

export type CastMember = {
  personId: number;
  name: string;
  profilePath: string | null;
  gender: number;
  role: RoleType;
  character: string;
  fee: number;
  billing: number;
  backend: number;
  starPower: number;
  talent: number;
  buzz: number;
  marketability: number;
  genres: string[];
  traits: HiddenTraits;
  isPlayerClient: boolean;
  satisfaction?: number;
  writtenOut: boolean;
  active: boolean;
  awardTrack: "actor" | "actress" | "open";
  episodeFee?: number;
  episodes?: number;
  blocks?: WorkBlock[];
  seriesDeal?: SeriesDeal;
  seasonNumber?: number;
  bonuses?: BoxBonus[];
  /** Episodes already commissioned, so weekly series pay does not double-count. */
  episodesPaid?: number;
};

export type Season = {
  number: number;
  episodes: number;
  episodeMinutes: number;
  schedule: ReleaseSchedule;
  prepStart: GameDate;
  shootStart: GameDate;
  shootWeeks: number;
  premiere: GameDate;
  episodesAired: number;
  viewership: number[];
  criticScore?: number;
  audienceScore?: number;
  renewal: RenewalOutcome;
  reviews: Review[];
  producedYear?: number;
  releasedYear?: number;
};

export type Project = {
  id: string;
  kind: "film" | "series";
  title: string;
  logline: string;
  genres: string[];
  budgetTier: BudgetTier;
  budget: number;
  marketing: number;
  directorId: number | null;
  directorName: string;
  directorPull: number;
  directorAcclaim: number;
  studio: string;
  prepStart: GameDate;
  shootStart: GameDate;
  shootWeeks: number;
  postWeeks: number;
  release: GameDate;
  format: SeriesFormat | null;
  network: string | null;
  episodeMinutes: number | null;
  seasons: Season[];
  phase: string;
  scriptQuality: number;
  scriptNote: string;
  prestige: number;
  risk: number;
  cast: CastMember[];
  openRole: {
    role: RoleType;
    character: string;
    billing: number;
    forPersonId: number | null;
  } | null;
  criticScore?: number;
  audienceScore?: number;
  reviews: Review[];
  openingWeekend?: number;
  weeklyGross: number[];
  domesticTotal?: number;
  internationalTotal?: number;
  totalGross?: number;
  profitLabel?: ProfitLabel;
  resultWhy?: { opening: string; critic: string; audience: string; profit: string };
  franchiseId?: string;
  sequelNumber: number;
  historical: boolean;
  playerInvolved: boolean;
  fycSpend: number;
  festival: string | null;
  commissionsPaid: number[];
  competitionNote?: string;
  ended: boolean;
  cancelled: boolean;
  origin?: "pilot" | "straight" | "limited";
  pilot?: PilotHold;
};

export type Offer = {
  id: string;
  projectId: string;
  personId: number;
  role: RoleType;
  character: string;
  fee: number;
  billing: number;
  backend: number;
  prestige: number;
  risk: number;
  feeWhy: string;
  prestigeWhy: string;
  riskWhy: string;
  scriptNote: string;
  expires: GameDate;
  status: "pending" | "accepted" | "declined" | "expired" | "killed" | "actor_refused";
  walkAwayFee: number;
  walkAwayBackend: number;
  minBilling: number;
  dateFlexible: boolean;
  perkAvailable: boolean;
  perk: string | null;
  dateShiftWeeks: number;
  studio: string;
  created: GameDate;
  pay?: "flat" | "episode" | "pilot";
  episodeFee?: number;
  episodes?: number;
  seasonNumber?: number;
  deal?: { style: SeriesDealStyle; seasons: number; annualBump: number };
  blocks?: WorkBlock[];
  bonuses?: BoxBonus[];
  willingness?: string;
  renewal?: boolean;
};

export type ApproachAsk = {
  commission: number;
  termYears: number;
  exclusive: boolean;
  exitClause: boolean;
};

export type Approach = {
  id: string;
  personId: number;
  name: string;
  profilePath: string | null;
  fame: FameTier;
  pitch: string;
  line: string;
  opening: ApproachAsk;
  ask: ApproachAsk;
  desiredCommission: number;
  walkAwayCommission: number;
  expires: GameDate;
  status: "pending" | "signed" | "passed" | "expired" | "walked";
  lastReply?: { outcome: "accepted" | "counter" | "walked" | "passed"; reason: string };
};

export type GameEvent = {
  id: string;
  type: string;
  title: string;
  body: string;
  personId?: number;
  projectId?: string;
  date: GameDate;
  choices: { id: string; label: string; hint: string }[];
  resolved?: string;
  expires: GameDate;
};

export type InboxItem = {
  id: string;
  date: GameDate;
  kind: "offer" | "approach" | "news" | "verdict" | "award" | "event" | "money" | "system";
  title: string;
  body: string;
  href?: string;
  read: boolean;
  resolved?: boolean;
  refId?: string;
};

export type NewsItem = {
  id: string;
  date: GameDate;
  headline: string;
  body: string;
};

export type AwardNominee = {
  projectId: string;
  personId?: number;
  name: string;
  title: string;
};

export type AwardRecord = {
  id: string;
  ceremonyId: string;
  ceremony: string;
  year: number;
  category: string;
  nominees: AwardNominee[];
  winnerIndex: number;
};

export type FestivalSubmission = {
  id: string;
  projectId: string;
  festival: string;
  festivalId: string;
  year: number;
  week: number;
  status: "submitted" | "accepted" | "declined" | "premiered";
  prize?: string;
};

export type BrandDeal = {
  id: string;
  personId: number;
  personName: string;
  brand: string;
  fee: number;
  start: GameDate;
  end: GameDate;
  status: "offered" | "active" | "done" | "declined";
};

export type Hold = {
  id: string;
  personId: number;
  start: GameDate;
  end: GameDate;
  reason: string;
  kind?: "personal" | "pilot" | "franchise" | "series";
  projectId?: string;
  /** Pilot holds show a status through this date without blocking the gaps. */
  until?: GameDate;
};

export type WorkBlock = {
  start: GameDate;
  weeks: number;
  episodes: number;
};

export type SeriesDeal = {
  style: SeriesDealStyle;
  seasons: number;
  seasonsServed: number;
  annualBump: number;
  episodeFee: number;
  role: RoleType;
};

export type PilotHold = {
  status: PilotStatus;
  decision: GameDate;
  optionSeasons: number;
  optionRole: RoleType;
  optionFee: number;
  optionEpisodes: number;
};

export type BoxBonus = {
  multiple: number;
  amount: number;
  paid?: boolean;
};

export type FranchiseFilm = {
  number: number;
  prep: GameDate;
  shootWeeks: number;
  fee: number;
  status: "held" | "offered" | "shot" | "dropped";
};

export type FranchiseLock = {
  id: string;
  title: string;
  films: FranchiseFilm[];
};

export type LedgerEntry = {
  date: GameDate;
  label: string;
  amount: number;
  balance: number;
  bucket?: LedgerBucket;
};

export type StaffMember = { role: StaffRole; level: number };

export type Agency = {
  name: string;
  cash: number;
  reputation: number;
  tier: AgencyTier;
  staff: StaffMember[];
  rent: number;
};

export type Rival = {
  id: string;
  name: string;
  reputation: number;
  blurb: string;
};

export type GameState = {
  version: 1;
  seed: number;
  rng: RngState;
  seq: number;
  era: Era;
  date: GameDate;
  agency: Agency;
  rivals: Rival[];
  clients: Client[];
  projects: Project[];
  offers: Offer[];
  approaches: Approach[];
  events: GameEvent[];
  inbox: InboxItem[];
  news: NewsItem[];
  awards: AwardRecord[];
  festivals: FestivalSubmission[];
  holds: Hold[];
  brandDeals: BrandDeal[];
  ledger: LedgerEntry[];
  genreTallies: Record<string, number>;
  genreTrends: Record<string, number>;
  usedTitles: string[];
  lastTurn: string[];
  insolventWeeks: number;
  ceremoniesRun: string[];
  /** In-game date of the last weekly autosave or manual save. Action writes do not move it. */
  lastAutosave?: GameDate;
};

export type ActionResult = {
  state: GameState;
  ok: boolean;
  message: string;
  warning?: string;
  href?: string;
};
