import type { BudgetTier, Era, SeriesFormat, StaffRole } from "./types";

export const GENRES = [
  "Drama",
  "Comedy",
  "Romantic Comedy",
  "Romance",
  "Action",
  "Thriller",
  "Crime",
  "Mystery",
  "Horror",
  "Sci-Fi",
  "Fantasy",
  "Superhero",
  "Animation",
  "Family",
  "War",
  "Western",
  "Musical",
  "Biopic",
  "Historical",
  "Documentary",
  "Sports",
] as const;

export type GenreName = (typeof GENRES)[number];

export const GENRE_BASE: Record<string, number> = {
  Drama: 1.12,
  Comedy: 1.08,
  "Romantic Comedy": 0.96,
  Romance: 0.9,
  Action: 1.08,
  Thriller: 1.04,
  Crime: 0.96,
  Mystery: 0.9,
  Horror: 1,
  "Sci-Fi": 0.96,
  Fantasy: 0.9,
  Superhero: 0.86,
  Animation: 0.82,
  Family: 0.84,
  War: 0.74,
  Western: 0.7,
  Musical: 0.72,
  Biopic: 0.8,
  Historical: 0.82,
  Documentary: 0.74,
  Sports: 0.8,
};

export const PRESTIGE_GENRE: Record<string, number> = {
  Drama: 82,
  Comedy: 48,
  "Romantic Comedy": 42,
  Romance: 50,
  Action: 38,
  Thriller: 55,
  Crime: 60,
  Mystery: 58,
  Horror: 40,
  "Sci-Fi": 52,
  Fantasy: 48,
  Superhero: 34,
  Animation: 55,
  Family: 40,
  War: 74,
  Western: 68,
  Musical: 62,
  Biopic: 84,
  Historical: 80,
  Documentary: 78,
  Sports: 58,
};

export const ERA_START: Record<Era, number> = {
  "1990s": 1995,
  "2000s": 2005,
  today: 2026,
};

export const STUDIOS = [
  "Harborlight Pictures",
  "Red Lantern Studios",
  "Northglass",
  "Pinion Entertainment",
  "Little Wren Films",
  "Monument Row",
  "Aster & Co.",
  "Bright Current",
  "Kite & Barrel",
  "Vesper Peak",
  "Copperline",
  "Halcyon Media",
  "Marlowe Street Pictures",
  "Sunroom Animation",
  "Fieldwork Docs",
];

export const STREAMERS: { name: string; strategy: number; reach: number }[] = [
  { name: "Nimbus", strategy: 0.15, reach: 1.15 },
  { name: "Channel 8", strategy: 0.05, reach: 0.9 },
  { name: "Harbor Streaming", strategy: -0.05, reach: 1.25 },
  { name: "Lark TV", strategy: 0.1, reach: 0.85 },
  { name: "Metro One", strategy: -0.1, reach: 1.05 },
  { name: "Kindling+", strategy: -0.22, reach: 1.35 },
  { name: "The Afterdark Channel", strategy: 0.08, reach: 0.7 },
  { name: "Pavilion", strategy: 0.18, reach: 0.95 },
  { name: "Weekday Broadcast", strategy: 0.02, reach: 1 },
  { name: "Canvas Originals", strategy: 0.12, reach: 1.1 },
];

export const OUTLETS = [
  "The Daily Reel",
  "Marquee Weekly",
  "Silver Screen Digest",
  "Westside Critic",
  "Premiere Post",
  "Lantern Review",
  "Box & Crown",
  "Night Gallery Notes",
  "Kinograph",
  "The Aisle Seat",
];

export const RIVALS = [
  { id: "meridian", name: "Meridian Artists", blurb: "Polished, impatient, and very good at lunches." },
  { id: "northvale", name: "North & Vale", blurb: "A literary shop that pretends not to care about money." },
  { id: "atlas", name: "Atlas Talent", blurb: "Volume dealers. Someone there is always on a plane." },
];

export const BRANDS = [
  "Lumen Watches",
  "Northroom Coffee",
  "Alto Fragrance",
  "Field & Pine",
  "Sable Motors",
  "Paperkite Airlines",
  "Hearth & Rye",
  "Vela Sunglasses",
  "Kindred Bank",
  "Orchard Soda",
];

export const STAFF_INFO: Record<
  StaffRole,
  { title: string; hire: number; weekly: number; max: number; blurb: string }
> = {
  junior_agent: {
    title: "Junior agent",
    hire: 40000,
    weekly: 1800,
    max: 3,
    blurb: "More offers, and the initial quotes come in a little hotter.",
  },
  scout: {
    title: "Scout",
    hire: 25000,
    weekly: 1100,
    max: 3,
    blurb: "Better inbound talent and earlier reads on what a client actually wants.",
  },
  publicist: {
    title: "Publicist",
    hire: 35000,
    weekly: 1400,
    max: 3,
    blurb: "Slower buzz decay, softer scandals, and campaigns that actually land.",
  },
  lawyer: {
    title: "Lawyer",
    hire: 55000,
    weekly: 2000,
    max: 3,
    blurb: "Studios bend further on counters, and poachers have a harder time.",
  },
};

export const BUDGETS: Record<BudgetTier, { min: number; max: number; marketing: number }> = {
  "micro-indie": { min: 80_000, max: 490_000, marketing: 0.4 },
  indie: { min: 500_000, max: 8_000_000, marketing: 0.45 },
  mid: { min: 12_000_000, max: 40_000_000, marketing: 0.5 },
  studio: { min: 45_000_000, max: 100_000_000, marketing: 0.6 },
  tentpole: { min: 140_000_000, max: 250_000_000, marketing: 0.55 },
};

export const TIER_WEIGHTS: Record<string, BudgetTier[]> = {
  Horror: ["micro-indie", "indie", "indie", "mid"],
  Documentary: ["micro-indie", "micro-indie", "indie"],
  "Romantic Comedy": ["indie", "mid", "mid", "studio"],
  Superhero: ["studio", "tentpole", "tentpole"],
  Animation: ["mid", "studio", "studio", "tentpole"],
  Action: ["mid", "studio", "studio", "tentpole"],
  "Sci-Fi": ["indie", "mid", "studio", "tentpole"],
  Fantasy: ["mid", "studio", "tentpole"],
  Western: ["indie", "mid", "mid"],
  War: ["mid", "studio", "studio"],
  Musical: ["indie", "mid", "studio"],
  Family: ["mid", "studio", "studio"],
  Biopic: ["indie", "mid", "mid", "studio"],
  Drama: ["micro-indie", "indie", "indie", "mid", "studio"],
  Sports: ["indie", "mid", "studio"],
};

export const SERIES_EPISODES: Record<SeriesFormat, { min: number; max: number; schedule: "weekly" | "binge" | "either" }> = {
  limited: { min: 6, max: 8, schedule: "either" },
  ongoing_drama: { min: 10, max: 13, schedule: "weekly" },
  sitcom: { min: 13, max: 18, schedule: "weekly" },
  streaming: { min: 8, max: 10, schedule: "binge" },
  miniseries: { min: 3, max: 5, schedule: "either" },
  anthology: { min: 6, max: 8, schedule: "either" },
};

export const CEREMONIES: {
  id: string;
  name: string;
  week: number;
  kind: "film" | "tv" | "film_tv" | "festival" | "razzie";
}[] = [
  { id: "globes", name: "Golden Globes", week: 2, kind: "film_tv" },
  { id: "sundance", name: "Sundance Film Festival", week: 3, kind: "festival" },
  { id: "critics", name: "Critics Circle Awards", week: 5, kind: "film" },
  { id: "bafta", name: "BAFTAs", week: 7, kind: "film" },
  { id: "sag", name: "SAG Awards", week: 8, kind: "film_tv" },
  { id: "oscars", name: "Academy Awards", week: 11, kind: "film" },
  { id: "razzies", name: "Golden Raspberry Awards", week: 11, kind: "razzie" },
  { id: "cannes", name: "Cannes Film Festival", week: 20, kind: "festival" },
  { id: "venice", name: "Venice Film Festival", week: 36, kind: "festival" },
  { id: "emmys", name: "Emmy Awards", week: 37, kind: "tv" },
  { id: "tiff", name: "Toronto International Film Festival", week: 37, kind: "festival" },
];

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const FIRST_NAMES = [
  "Alex", "Jordan", "Sam", "Riley", "Morgan", "Casey", "Avery", "Quinn", "Reese", "Drew",
  "Elena", "Marcus", "Priya", "Jonah", "Nora", "Felix", "Hana", "Omar", "Lucia", "Theo",
  "Mina", "Callum", "Yara", "Leo", "Sable", "Idris", "June", "Rafa", "Cleo", "Nate",
  "Amira", "Hugo", "Ines", "Paolo", "Willa", "Kenji", "Rosa", "Micah", "Ade", "Noor",
];

export const LAST_NAMES = [
  "Voss", "Okoye", "Marlow", "Chen", "Adler", "Ibarra", "Singh", "Duval", "Hart", "Nguyen",
  "Berg", "Costa", "Ellison", "Farouk", "Greene", "Hale", "Ivers", "Cho", "Lang", "Moreau",
  "Petrova", "Sato", "Ward", "Abebe", "Rossi", "Klein", "Diaz", "Frost", "Rahman", "Blake",
];

export const TITLE_PARTS: Record<string, { a: string[]; b: string[]; c: string[] }> = {
  Drama: { a: ["The Last", "A Quiet", "Ordinary", "Late", "Small", "The Weight of"], b: ["Winter", "Mercy", "Sunday", "Harbor", "Kin", "August"], c: ["Light", "Rooms", "Distance", "Fathers", "Rain", "Hours"] },
  Comedy: { a: ["Absolutely", "Barely", "Accidentally", "Politely", "Wildly", "Almost"], b: ["Engaged", "Famous", "Responsible", "Invited", "Employed", "Sorry"], c: ["Again", "On Purpose", "for the Weekend", "in Public", "at the Reunion", "This Time"] },
  "Romantic Comedy": { a: ["Two", "The Other", "Not Another", "My", "Our", "A Very"], b: ["Plus One", "Meet-Cute", "Reservation", "Ex", "Neighbor", "December"], c: ["in June", "on Paper", "Next Door", "at the Wedding", "for Christmas", "on a Tuesday"] },
  Romance: { a: ["Letters from", "Summer in", "The Map of", "Before", "After", "A Season in"], b: ["Lisbon", "the Coast", "April", "You", "Midnight", "the Orchard"], c: ["Light", "Return", "Weather", "Silence", "Bloom", "Tide"] },
  Action: { a: ["Final", "Broken", "Silent", "Rogue", "Iron", "Last"], b: ["Protocol", "Extract", "Meridian", "Harbor", "Signal", "Vector"], c: ["Run", "Hour", "Code", "Line", "Point", "Fire"] },
  Thriller: { a: ["The", "Night", "Cold", "Deep", "Thin", "Black"], b: ["Passenger", "Witness", "Room", "Signal", "Margin", "Tenant"], c: ["Knows", "Waits", "Listens", "Returns", "Vanishes", "Knocks"] },
  Crime: { a: ["The", "City of", "King of", "Low", "Dirty", "Saint"], b: ["Take", "Ledger", "Borough", "Fix", "Crew", "Debt"], c: ["Men", "Money", "Night", "Rules", "Ashes", "Kings"] },
  Mystery: { a: ["The", "Who", "What the", "The Last", "An", "Where the"], b: ["Vanishing", "House", "Lake", "Guest", "Key", "Photograph"], c: ["Kept", "Saw", "Hid", "Left Behind", "Wouldn't Say", "Remembered"] },
  Horror: { a: ["Don't", "The", "It", "We", "Something", "Never"], b: ["Open", "Follows", "Waits", "Breathes", "Knocks", "Stays"], c: ["Inside", "Below", "After Dark", "in the Walls", "Upstairs", "Again"] },
  "Sci-Fi": { a: ["Station", "Orbit", "The", "Second", "Colony", "Signal"], b: ["Eleven", "Year", "Drift", "Protocol", "Light", "Archive"], c: ["Wakes", "Falls", "Remembers", "Answers", "Goes Dark", "Arrives"] },
  Fantasy: { a: ["The", "Crown of", "Song of", "Gate of", "Child of", "Map of"], b: ["Thorn", "Ember", "Glass", "River", "Ash", "Moon"], c: ["King", "Witch", "Road", "Oath", "Forest", "Name"] },
  Superhero: { a: ["The", "Rise of", "Night of", "We Are", "Call Me", "Age of"], b: ["Vanguard", "Spark", "Redline", "Halcyon", "Northstar", "Parcel"], c: ["Returns", "Unmasked", "Falls", "Awakens", "Together", "Protocol"] },
  Animation: { a: ["Little", "The Great", "A", "Captain", "Princess", "The Secret"], b: ["Rocket", "Garden", "Wolf", "of Somewhere", "Kite", "Orchestra"], c: ["Adventure", "and the Moon", "Gets Lost", "Saves Tuesday", "Learns to Fly", "at Sea"] },
  Family: { a: ["My", "The", "Dad's", "Our", "The Incredible", "Summer of"], b: ["Dog", "Treehouse", "Robot", "Grand Plan", "Road Trip", "Team"], c: ["Goes to Camp", "Saves the Day", "Moves In", "and Me", "on Tour", "Problem"] },
  War: { a: ["The", "Letters from", "Last", "Winter at", "Company of", "Until"], b: ["Ridge", "Dawn", "Bridge", "the Line", "Quiet Men", "Thursday"], c: ["Holds", "Falls", "Remains", "Writes Back", "Comes Home", "Breaks"] },
  Western: { a: ["Dust", "The", "Rider", "No", "West of", "A"], b: ["and Mercy", "Gulch", "on the Plain", "Gold Left", "Red Rock", "Long Winter"], c: ["County", "Trail", "Sermon", "Range", "Town", "Bargain"] },
  Musical: { a: ["Sing", "The", "Encore", "A Chorus", "Footlights", "One More"], b: ["for the Balcony", "on 8th", "in Minor", "of Us", "After Midnight", "Song"], c: ["Together", "Tonight", "Please", "and Dance", "in Harmony", "Out Loud"] },
  Biopic: { a: ["I Am", "The Life of", "Becoming", "Simply", "Call Her", "The"], b: ["Ada Voss", "the Voice", "Miles Hart", "Unwritten", "Queen of Radio", "Last Set"], c: ["A Portrait", "in Their Own Words", "Unfinished", "on the Record", "Rising", "Alone"] },
  Historical: { a: ["The", "Court of", "Year of", "The Painter's", "Empire of", "A"], b: ["Crown", "Silk", "Rebels", "Daughter", "Salt", "Treaty"], c: ["1742", "in Winter", "and Flame", "Affair", "House", "of Two Cities"] },
  Documentary: { a: ["After", "The Making of", "Notes on", "While", "Inside", "What We"], b: ["the Flood", "a City", "Silence", "the Band Was", "the Factory", "Owed"], c: ["a Film", "Still Here", "Talking", "Working", "Leaving", "the Truth"] },
  Sports: { a: ["One", "The", "Extra", "Home", "Undefeated", "Last"], b: ["More Game", "Tryout", "Innings", "Field", "Season", "Whistle"], c: ["for the Cup", "on Friday", "Advantage", "Night", "Under Lights", "and Glory"] },
};

export const LOGLINES: Record<string, string[]> = {
  Drama: [
    "A {role} tries to {goal} before {stakes}.",
    "When the family business falters, {role} has one season to tell the truth.",
    "Two people who no longer speak must share a house until the will is read.",
  ],
  Comedy: [
    "{role} has one week to undo a lie that got completely out of hand.",
    "A disastrous plan to look successful collides with an even worse reunion.",
    "{role} agrees to a favor and accidentally becomes the face of a movement.",
  ],
  "Romantic Comedy": [
    "{role} and a sworn rival are paired for a wedding they both need to survive.",
    "A fake relationship turns inconvenient the moment it starts working.",
    "They were supposed to share a cab, not a year.",
  ],
  Romance: [
    "A summer by the water gives {role} a reason to stay, and a reason to leave.",
    "Letters arrive decades late, and someone is still waiting on the answer.",
    "{role} falls for the one person the family cannot afford to like.",
  ],
  Action: [
    "{role} has twelve hours to cross a city that wants them stopped.",
    "A retired specialist is pulled back for one extraction that was never clean.",
    "When the convoy vanishes, {role} is the only one who knows the route.",
  ],
  Thriller: [
    "{role} notices the same stranger on three different nights.",
    "A perfect alibi starts to unravel the moment the phone rings.",
    "Someone in the building is lying, and {role} is locking the doors from the inside.",
  ],
  Crime: [
    "A careful crew plans one last take, then the money moves without them.",
    "{role} owes the wrong people and has a weekend to invent a way out.",
    "Loyalty in the borough only lasts as long as the take stays even.",
  ],
  Mystery: [
    "A guest checks in and does not check out. {role} kept the ledger.",
    "The photograph is dated next week, and everyone in it is still alive.",
    "{role} inherits a house and the question the last owner would not answer.",
  ],
  Horror: [
    "{role} should not have answered. The house heard it anyway.",
    "They promised the thing in the walls would leave if nobody looked.",
    "A weekend away turns into a set of rules nobody wrote down.",
  ],
  "Sci-Fi": [
    "The signal from Station Eleven is {role}'s own voice, sent tomorrow.",
    "A colony wakes to find the planet remembers them.",
    "{role} is the backup. The original did not survive the drift.",
  ],
  Fantasy: [
    "{role} is the only one who can read the old road, and the road is hungry.",
    "A broken oath wakes something the kingdom buried on purpose.",
    "To save the river, {role} has to give the forest a true name.",
  ],
  Superhero: [
    "The city needed a symbol. It got {role}, who is already late.",
    "Powers are easy. Keeping a secret identity through one bad week is not.",
    "A new threat wears a familiar face, and the team is one short.",
  ],
  Animation: [
    "A small hero and a worse map set out to put the moon back where it belongs.",
    "{role} joins an orchestra of animals that only plays when the town is in trouble.",
    "Getting lost was the plan. Saving Tuesday was not.",
  ],
  Family: [
    "The family trip goes sideways, and the dog is now in charge of navigation.",
    "{role} has to get everyone to the recital without telling Mom what happened to the car.",
    "A kid, a grandparent, and a very patient robot fix a summer.",
  ],
  War: [
    "{role} has to hold a bridge until dawn, with a company that is already short.",
    "Letters home take three weeks. The decision takes one night.",
    "After the armistice, one road is still not safe, and {role} knows why.",
  ],
  Western: [
    "A rider comes into town with a debt and leaves with a worse one.",
    "{role} is the only law for forty miles, and the law is tired.",
    "They came for gold. The valley kept the receipt.",
  ],
  Musical: [
    "One more night of rehearsal, and the company either opens or falls apart.",
    "{role} can sing the truth but cannot say it.",
    "A jukebox, a fire escape, and a chorus that refuses to go home.",
  ],
  Biopic: [
    "The story everyone thinks they know, told from the year nobody filmed.",
    "{role} becomes famous for the wrong verse and spends a life correcting it.",
    "A portrait of a career built in rooms that did not want them there.",
  ],
  Historical: [
    "In a court that rewards silence, {role} chooses the dangerous sentence.",
    "A treaty, a marriage, and a city that will only survive one of them.",
    "The painter was hired to flatter a king and painted the truth instead.",
  ],
  Documentary: [
    "A crew follows the last season of a place the map is about to forget.",
    "Interviews, receipts, and the story people agreed not to tell.",
    "{role} spent ten years collecting tape. This is the cut that remains.",
  ],
  Sports: [
    "{role} has one game to justify a career of almost.",
    "An underfunded team, a brutal schedule, and a captain who will not sit.",
    "Everybody loves a comeback. Nobody wants to fund the middle of it.",
  ],
};

export const GOALS = [
  "keep the family together",
  "finish the job clean",
  "tell the truth on the record",
  "get home before the storm",
  "protect a kid who saw too much",
  "win a case that cannot be won",
];

export const STAKES = [
  "the money runs out",
  "someone they love pays for it",
  "the town finds out",
  "the offer expires",
  "the lights come up",
  "winter closes the road",
];
