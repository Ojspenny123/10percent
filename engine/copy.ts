import { FIRST_NAMES, GOALS, LAST_NAMES, LOGLINES, OUTLETS, STAKES } from "./constants";
import { pick } from "./rng";
import type { RngState } from "./rng";
import type { VerdictLabel } from "./types";

export function characterName(rng: RngState): string {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

export function loglineFor(rng: RngState, genre: string): string {
  const bank = LOGLINES[genre] ?? LOGLINES.Drama!;
  const template = pick(rng, bank);
  return template
    .replaceAll("{role}", pick(rng, ["a reluctant lead", "an outsider", "a former prodigy", "a careful professional"]))
    .replaceAll("{goal}", pick(rng, GOALS))
    .replaceAll("{stakes}", pick(rng, STAKES));
}

export function scriptNote(quality: number): string {
  if (quality >= 80) return "The pages are the real thing. People are already quoting them.";
  if (quality >= 65) return "Solid script. A few soft scenes, nothing fatal.";
  if (quality >= 50) return "Uneven pages. The third act is still a guess.";
  return "Troubled script. Rewrites are already part of the offer.";
}

const REVIEW_HIGH = [
  (title: string, genre: string) => `${title} is a ${genre.toLowerCase()} that knows exactly what it wants to be.`,
  (title: string) => `Confident, specific, and hard to shake. ${title} earns the runtime.`,
  (title: string, genre: string) => `The best ${genre.toLowerCase()} of the season, and it is not particularly close.`,
  (title: string) => `${title} trusts the audience. That still feels rare.`,
];

const REVIEW_MID = [
  (title: string, genre: string) => `${title} is a perfectly watchable ${genre.toLowerCase()}, and not much more.`,
  (title: string) => `There is a better movie hiding inside ${title}. You can see it in the middle hour.`,
  (title: string) => `${title} does the job. You will forget the ending on the way to the car.`,
  (title: string, genre: string) => `A mid-pack ${genre.toLowerCase()} with one scene worth the ticket.`,
];

const REVIEW_LOW = [
  (title: string) => `${title} is a long walk to a conclusion nobody asked for.`,
  (title: string, genre: string) => `A ${genre.toLowerCase()} made of spare parts. None of them fit.`,
  (title: string) => `Everyone looks lost, including ${title} itself.`,
  (title: string) => `By the hour mark, ${title} has run out of ideas and kept the cameras on anyway.`,
];

const ACTOR_PRAISE = [
  (name: string) => `${name} is the reason any of this lingers.`,
  (name: string) => `Whenever ${name} is on screen, the movie remembers what it is about.`,
  (name: string) => `${name} finds a person inside a role that was mostly costume.`,
];

const ACTOR_PAN = [
  (name: string) => `${name} is stranded by the material and never finds a way through it.`,
  (name: string) => `Even ${name} cannot sell the third-act speech.`,
  (name: string) => `${name} looks like they took the job for the quote, and the camera knows.`,
];

export function reviewLine(
  rng: RngState,
  title: string,
  genre: string,
  score: number,
  actor?: { id: number; name: string; standout: "praise" | "pan" | "none" },
): { outlet: string; score: number; text: string; actorId?: number; actorName?: string } {
  const bank = score >= 75 ? REVIEW_HIGH : score >= 50 ? REVIEW_MID : REVIEW_LOW;
  let text = pick(rng, bank)(title, genre);
  if (actor && actor.standout === "praise") text = `${text} ${pick(rng, ACTOR_PRAISE)(actor.name)}`;
  if (actor && actor.standout === "pan") text = `${text} ${pick(rng, ACTOR_PAN)(actor.name)}`;
  return {
    outlet: pick(rng, OUTLETS),
    score,
    text,
    actorId: actor && actor.standout !== "none" ? actor.id : undefined,
    actorName: actor && actor.standout !== "none" ? actor.name : undefined,
  };
}

export function starsLabel(stars: number): VerdictLabel {
  if (stars >= 5) return "Loved";
  if (stars >= 4) return "Liked";
  if (stars >= 3) return "Mixed";
  if (stars >= 2) return "Disliked";
  return "Regretted";
}

const VERDICT: Record<string, Record<"high" | "mid" | "low", string[]>> = {
  art: {
    high: [
      "Loved the script, and the director actually protected it.",
      "This is the one I'll still want on the reel in ten years.",
      "The work was serious and nobody apologized for that.",
    ],
    mid: [
      "The pages were better than the movie we made.",
      "Some of it is honest. Some of it got noted to death.",
      "I can defend the performance. I cannot defend the cut.",
    ],
    low: [
      "They sanded off everything that made the script worth doing.",
      "I came for the work and stayed for a product.",
      "Wish I'd held out for something with a point of view.",
    ],
  },
  greedy: {
    high: [
      "The quote was fair and the billing matched. I'm good.",
      "They paid what the role was worth. That still matters.",
      "Clean deal, clean set, no surprises on the check.",
    ],
    mid: [
      "The money was fine. The backend is a story they tell themselves.",
      "I earned it, but I left a little on the table.",
      "Not a bad payday. Not the one I was promised in the room.",
    ],
    low: [
      "I should have been paid more for what this turned into.",
      "They got a lead performance at a supporting price.",
      "The deal was the worst part of a bad job.",
    ],
  },
  ambitious: {
    high: [
      "This is the one that moves me up the call sheet.",
      "Big role, real director, people will see it. That's the job.",
      "I wanted the center of the movie and I got it.",
    ],
    mid: [
      "Fine work. Not the leap I was looking for.",
      "I'll take the credit, but it won't change the next meeting.",
      "Solid. I still need the one with my name over the title.",
    ],
    low: [
      "They billed me like a guest in my own movie.",
      "I did not sign on to stand behind someone else's poster.",
      "This sets me back. I can feel it.",
    ],
  },
  loyal: {
    high: [
      "Good people, a fair plan, and you told me the truth about it.",
      "I'd do another one with this team tomorrow.",
      "Thank you for not overselling it. It was exactly the job you described.",
    ],
    mid: [
      "I stayed because I said I would. It was harder than you let on.",
      "We got through it. Next time I want fewer surprises.",
      "I'm not angry. I am tired.",
    ],
    low: [
      "I trusted the read you gave me, and the set did not match it.",
      "Don't put me in another one like this and tell me it's a favor.",
      "I kept my word. I'm not sure the agency kept its.",
    ],
  },
  bold: {
    high: [
      "Strange, risky, and it worked. That's the only reason to do this.",
      "I'd rather swing like this than play it safe for a year.",
      "The weird version is the one we shot. I'm proud of that.",
    ],
    mid: [
      "It started brave and finished careful.",
      "There was a wilder movie in week one. I miss it.",
      "Not a disaster. Not the gamble I thought I was taking.",
    ],
    low: [
      "We took the risk and then got scared of it.",
      "If it's going to miss, it should at least miss on purpose.",
      "Safe and bad is the worst combination.",
    ],
  },
  steady: {
    high: [
      "Professional set, clear role, good result. No complaints.",
      "I liked the people and I liked the work.",
      "Happy I did it.",
    ],
    mid: [
      "It was a job. Some days better than others.",
      "Nothing to write home about, nothing to hide from.",
      "Fine. On to the next one.",
    ],
    low: [
      "Long weeks for a movie I don't particularly like.",
      "I wish the shoot hadn't gone the way it did.",
      "I'd skip this one if I had the week back.",
    ],
  },
};

export function verdictCopy(
  rng: RngState,
  personality: string,
  stars: number,
  notes: string[],
): string {
  const band = stars >= 4 ? "high" : stars === 3 ? "mid" : "low";
  const bank = VERDICT[personality] ?? VERDICT.steady!;
  const line = pick(rng, bank[band]);
  const extra = notes.length ? ` ${pick(rng, notes)}` : "";
  return `${line}${extra}`;
}

export function releaseVerdictCopy(rng: RngState, stars: number, profit: string | undefined, critic: number | undefined): string {
  if ((critic ?? 0) >= 80 && stars >= 4) return pick(rng, ["Proud of it. The reviews saw what we were doing.", "This is the one I'll send people.", "Feels good to be right about a script."]);
  if ((profit === "blockbuster" || profit === "hit") && (critic ?? 50) < 55) {
    return pick(rng, ["It's a hit. I still wish the reviews were kinder.", "The gross is loud. I know what we made.", "People showed up. I'm not framing the notices."]);
  }
  if (profit === "flop" || profit === "bomb" || profit === "disappointment") {
    return pick(rng, ["Wish I'd skipped it.", "The audience did not come, and I understand why.", "Proud of a couple of scenes. Not of the Saturday number."]);
  }
  if ((critic ?? 0) >= 75) return pick(rng, ["The reviews were fair, which is all I wanted.", "Critics found it. That matters for the next room."]);
  return pick(rng, ["It's out in the world now. I can live with that.", "Mixed bag, same as the shoot.", "Not the story I hoped the opening weekend would tell."]);
}

export function headline(rng: RngState, kind: string, subject: string): string {
  const banks: Record<string, string[]> = {
    release: [`${subject} opens to a curious crowd`, `${subject} lands in theaters`, `Opening weekend: ${subject}`],
    award: [`${subject} hears its name called`, `Awards watch: ${subject}`, `${subject} enters the season`],
    signing: [`${subject} changes representation`, `New client: ${subject}`, `${subject} signs`],
    scandal: [`A messy week for ${subject}`, `${subject} and a story nobody can quite confirm`],
    series: [`${subject} returns to the schedule`, `Viewers check in on ${subject}`],
  };
  return pick(rng, banks[kind] ?? [`Industry note: ${subject}`]);
}
