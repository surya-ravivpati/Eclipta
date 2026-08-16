/**
 * Starter forum threads and study groups.
 *
 * These ship as **team-authored reference content**, not as posts by invented
 * learners. The difference matters: a forum seeded with fake peers asking fake
 * homework questions — with fake upvotes and fake accepted answers — tells a real
 * user that other learners found those answers useful when nobody did. That is
 * fabricated social proof, and it is also self-defeating, because the first real
 * user who replies to "Sarah" and gets nothing back learns the whole board is
 * hollow.
 *
 * So every row here carries `content_source: 'seed' | 'official'`, is authored by
 * the Eclipta team, and ships with **zero votes and no accepted answers**. What
 * it provides is genuinely valuable and honestly labelled: a board that already
 * answers the questions newcomers actually have, and study groups that exist and
 * can be joined.
 *
 * Written as guides *because* they are labelled as guides — which means they can
 * be more useful than a peer post would be.
 */

export type SeedCategory =
  | "getting_started"
  | "study_tips"
  | "battle_strategy"
  | "luna_prompts"
  | "subject"
  | "announcement"
  | "feedback";

export interface SeedThread {
  slug: string;
  category: SeedCategory;
  course: string;
  title: string;
  body: string;
  tags: string[];
  source: "seed" | "official";
  /** Team-authored follow-ups, e.g. a worked example under a strategy guide. */
  answers?: { body: string }[];
}

const TEAM = "Eclipta Team";

export const SEED_THREADS: SeedThread[] = [
  // ── Getting started ────────────────────────────────────────────────────────
  {
    slug: "welcome-how-this-works",
    category: "announcement",
    course: "General",
    title: "Welcome to Eclipta — how the platform fits together",
    tags: ["welcome", "guide"],
    source: "official",
    body: `Eclipta has four parts, and they feed each other.

**Courses** are where you learn. Build one from a topic you care about, or take a certified course. Every question you answer anywhere updates your mastery map.

**Battles** are where you practise under pressure. You pick an archetype — a stat sheet with a signature passive — and answer questions to deal damage. Losing costs nothing but time.

**Pressure Mode** is exam conditions: a real clock, no pausing, optional distractions. Use it before the real thing.

**Luna** is a tutor that gives hints, not answers. That is deliberate. A hint you act on teaches you more than a solution you read.

You do not need to use all four. Most people start with one course and one battle a day.`,
  },
  {
    slug: "which-archetype-should-i-pick",
    category: "battle_strategy",
    course: "General",
    title: "Which battle archetype should I start with?",
    tags: ["battles", "archetypes", "guide"],
    source: "seed",
    body: `Short answer: **Tank** if you want to learn the mechanics without dying, **Speedster** if you already know the material and want a challenge.

The full trade-off:

- **Tank** — 220 HP, 20% damage reduction, easy questions (difficulty 2–5), but only 11 damage and it cannot heal. You will survive long enough to understand the Focus economy.
- **Healer** — 145 HP, the longest clock in the game at 70s, and a heal that also grants a shield. Best if the timer is what stresses you.
- **Speedster** — 130 HP but a 20–40s clock, and damage that scales with how fast you answer. Punishing if you are still reading the question twice.
- **Apex** — 34 damage on 95 HP with no armour, and it gets *stronger* below 35 HP. High risk, short matches.
- **Accelerator** — starts at 14 damage and climbs to 30 as you answer correctly. Rewards a long match.
- **Fulcrum** — balanced, and borrows a random rival passive each round.
- **Gambler** — every stat rerolls each match. Fun, not learnable.
- **God** — the highest stats and the hardest questions (difficulty 8–10). Unlocks late for a reason.

Pick the one whose *drawback* you can live with. The upside sorts itself out.`,
    answers: [
      {
        body: `A note on Focus, since it confuses people: **Attack and Heal build Focus, Charge spends it.** Your Ultimate is separate — it runs off its own charge meter, filled only by correct answers. So you are never choosing between Charge and your Ultimate; they draw from different pools.`,
      },
    ],
  },
  {
    slug: "how-to-use-luna-well",
    category: "luna_prompts",
    course: "General",
    title: "Getting useful answers out of Luna",
    tags: ["luna", "ai", "guide"],
    source: "seed",
    body: `Luna is built to withhold answers, so the prompts that work are the ones that ask for *structure* rather than solutions.

**Works well:**
- "I got −4 and the answer is 4. Where does the sign flip?"
- "Explain integration by parts as if I already know the product rule."
- "Give me three problems that use this idea but look different."
- "What is the one sentence I should remember about this?"
- "I think the answer is X because Y. Is my reasoning wrong, or just my arithmetic?"

**Works badly:**
- "Solve question 4." — you will get a hint, and you will be annoyed.
- "Is this right?" with no working — Luna cannot see what you did.

The most useful habit: tell Luna *what you already believe* and let it correct the belief rather than the answer. That is the difference between fixing one question and fixing the misconception behind twenty.`,
  },

  // ── Study technique ────────────────────────────────────────────────────────
  {
    slug: "spacing-beats-cramming",
    category: "study_tips",
    course: "General",
    title: "Why the review timer spaces things out the way it does",
    tags: ["study-tips", "memory", "guide"],
    source: "seed",
    body: `Eclipta schedules reviews at expanding intervals rather than letting you re-read something five times in one sitting. That feels less productive. It is not.

Re-reading produces *fluency* — the text feels familiar, so you feel like you know it. Recalling produces *retrieval strength*, which is what an exam actually tests. The uncomfortable feeling of trying to remember something you half-forgot is the mechanism working.

Practical version:
1. Attempt before you review. Always. Even a wrong attempt primes the correction.
2. Stop when you get it right *once* cold, not five times warm.
3. Come back tomorrow, not in ten minutes.

If a review feels easy, the interval was too short and you wasted the rep.`,
  },
  {
    slug: "what-to-do-when-stuck",
    category: "study_tips",
    course: "General",
    title: "A procedure for being stuck",
    tags: ["study-tips", "guide"],
    source: "seed",
    body: `Being stuck is a state with an exit, not a verdict on you. In order:

1. **Write down what you know.** Half of stuckness is unstated information.
2. **Name the thing you cannot do.** "I cannot integrate this" is workable. "I don't get it" is not.
3. **Solve a smaller version.** Replace the hard number with 1. Replace the general case with a specific one.
4. **Work backwards from the answer** if you have it.
5. **Ask Luna for the *next step only*.** Not the solution.
6. **Leave it and come back.** Sleeping on a problem is a real technique, not a euphemism for giving up.

Steps 1–3 solve most of them. Step 6 solves a surprising number of the rest.`,
  },
  {
    slug: "pressure-mode-first-time",
    category: "study_tips",
    course: "General",
    title: "Your first Pressure Mode session — what to expect",
    tags: ["pressure-mode", "exams", "guide"],
    source: "seed",
    body: `Pressure Mode runs a real clock that does not stop when you switch tabs. That is the point.

Before your first one:
- **Start shorter than the real exam.** 20 minutes teaches pacing; 3 hours teaches exhaustion.
- **Leave distractions off the first time.** Add them once the format itself is familiar.
- **Answer the confidence prompt honestly.** The score rewards *calibration*, not bravado — being unsure and wrong scores well, because knowing what you don't know is the skill that transfers.

Afterwards, the review will show you things you cannot feel from the inside: whether accuracy dropped in the back half, how often you changed an answer, and whether the questions you were most sure about were the ones you got wrong. That last one is usually the most useful.

Unanswered questions count as incorrect, because on a real exam a blank is a blank — but the review reports them separately, as pacing rather than knowledge.`,
  },

  // ── Subject reference ──────────────────────────────────────────────────────
  {
    slug: "integration-by-parts-when",
    category: "subject",
    course: "Mathematics",
    title: "Integration by parts: how to know it's the right tool",
    tags: ["mathematics", "calculus", "guide"],
    source: "seed",
    body: `Parts is for integrating a **product** where one factor gets simpler when differentiated and the other does not get worse when integrated.

The formula, \`∫u dv = uv − ∫v du\`, is only useful if \`∫v du\` is easier than what you started with. That is the whole judgement call.

Choosing \`u\`: the usual ordering is **L-I-A-T-E** — Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential. Pick \`u\` from earliest in that list.

- \`∫x·ln x dx\` → \`u = ln x\` (logarithmic beats algebraic)
- \`∫x·eˣ dx\` → \`u = x\` (algebraic beats exponential)

Two signs you have chosen wrong: the new integral looks worse than the old one, or you are going in circles. Circling is not always failure though — \`∫eˣ sin x dx\` comes back to itself, and you solve for the integral algebraically.`,
    answers: [
      {
        body: `Worked example, since the sign is where most errors happen.

\`∫x·eˣ dx\` with \`u = x\`, \`dv = eˣ dx\` → \`du = dx\`, \`v = eˣ\`.

\`= x·eˣ − ∫eˣ dx = x·eˣ − eˣ + C = eˣ(x − 1) + C\`

The minus sign applies to the *whole* remaining integral, not just its first term. If you are consistently off by a sign, that is almost always where.`,
      },
    ],
  },
  {
    slug: "vectors-intuition",
    category: "subject",
    course: "Mathematics",
    title: "Dot product vs cross product, without the formulas",
    tags: ["mathematics", "vectors", "linear-algebra", "guide"],
    source: "seed",
    body: `**Dot product** answers "how much do these point the same way?" It gives a number. Zero means perpendicular. Negative means opposing. It is the tool whenever you need a projection, a component, or work done by a force.

**Cross product** answers "what plane do these two define, and how much area do they span?" It gives a *vector*, perpendicular to both, whose length is the area of the parallelogram they form. Zero means parallel. It is the tool for torque, angular momentum, and normals to a surface.

A quick check on any answer: if you dotted two vectors and got a vector, or crossed them and got a number, the mistake is upstream of the arithmetic.`,
  },
  {
    slug: "cell-respiration-overview",
    category: "subject",
    course: "Biology",
    title: "Cellular respiration: the four stages and what each is for",
    tags: ["biology", "respiration", "guide"],
    source: "seed",
    body: `The exam-useful framing is *what each stage produces*, not the intermediate names.

1. **Glycolysis** (cytoplasm) — glucose → 2 pyruvate. Net 2 ATP, 2 NADH. Works without oxygen, which is why it is the fallback.
2. **Link reaction** (mitochondrial matrix) — pyruvate → acetyl-CoA. Releases CO₂, makes NADH.
3. **Krebs cycle** (matrix) — acetyl-CoA fully oxidised. The point is not ATP (only 2 per glucose) but *electron carriers*: 6 NADH, 2 FADH₂.
4. **Oxidative phosphorylation** (inner membrane) — the carriers dump electrons into the chain, pumping H⁺ to build a gradient. ATP synthase converts that gradient to ~26–28 ATP.

The single idea: stages 1–3 exist to load electron carriers. Stage 4 cashes them in. If you remember only that, you can reconstruct most of the detail.`,
  },
  {
    slug: "big-o-what-it-measures",
    category: "subject",
    course: "Computer Science",
    title: "Big-O: what it actually measures, and what it ignores",
    tags: ["computer-science", "algorithms", "guide"],
    source: "seed",
    body: `Big-O describes how runtime *grows* as input grows. It deliberately throws away constants and lower-order terms, which is both its power and its trap.

\`O(n)\` and \`O(100n)\` are the same complexity. On real input of size 1000, one is a hundred times slower. Complexity tells you which algorithm wins *eventually*, not which wins today.

Where it misleads:
- **Small n.** Insertion sort beats quicksort below ~10 elements, which is why real sort implementations switch.
- **Constants that hide work.** Hash lookup is \`O(1)\` but hashing a long string is not free.
- **Memory access patterns.** An \`O(n log n)\` algorithm with sequential access can beat an \`O(n)\` one that jumps around cache.

Interview version: state the complexity, then state the assumption it rests on. "\`O(1)\` amortised, assuming the hash distributes well" is a better answer than "\`O(1)\`".`,
  },

  // ── Feedback ───────────────────────────────────────────────────────────────
  {
    slug: "feature-requests-here",
    category: "feedback",
    course: "General",
    title: "Feature requests and bug reports — post them here",
    tags: ["feedback", "meta"],
    source: "official",
    body: `This is the right place for both.

**Bug reports** are most useful with: what you did, what you expected, what happened, and which browser. A screenshot beats a description.

**Feature requests** are most useful with the *problem*, not just the proposed solution. "I lose my place when I switch devices" tells us more than "add bookmarks", because there may be a better fix than bookmarks.

We read everything here. We will not build everything, and we will try to say why when we don't.`,
  },
];

// ── Starter groups ───────────────────────────────────────────────────────────

export interface SeedGroup {
  slug: string;
  name: string;
  topic: string;
  goalText: string;
  /** Grouping axis, so the directory can be filtered. */
  axis: "subject" | "exam" | "grade" | "interest";
  isPublic: true;
}

/**
 * Starter groups ship **empty and joinable**, not pre-filled with invented
 * members. A group listing "14 members" that contains nobody is worse than an
 * empty one: the first real person to join finds a ghost town and leaves.
 *
 * What these do provide is structure — somewhere obvious to go for a given
 * subject or exam, so the first real members find each other instead of each
 * creating their own empty room.
 */
export const SEED_GROUPS: SeedGroup[] = [
  {
    slug: "grp-calculus",
    name: "Calculus Study Room",
    topic: "Calculus",
    goalText: "Work through derivatives, integrals and series together.",
    axis: "subject",
    isPublic: true,
  },
  {
    slug: "grp-linear-algebra",
    name: "Linear Algebra",
    topic: "Linear Algebra",
    goalText: "Matrices, eigenvalues and the geometry behind them.",
    axis: "subject",
    isPublic: true,
  },
  {
    slug: "grp-organic-chem",
    name: "Organic Chemistry",
    topic: "Organic Chemistry",
    goalText: "Mechanisms, synthesis routes and naming.",
    axis: "subject",
    isPublic: true,
  },
  {
    slug: "grp-cell-biology",
    name: "Cell Biology",
    topic: "Biology",
    goalText: "Respiration, photosynthesis, division and genetics.",
    axis: "subject",
    isPublic: true,
  },
  {
    slug: "grp-mechanics",
    name: "Physics: Mechanics",
    topic: "Mechanics",
    goalText: "Forces, momentum, energy and rotational motion.",
    axis: "subject",
    isPublic: true,
  },
  {
    slug: "grp-algorithms",
    name: "Algorithms & Data Structures",
    topic: "Computer Science",
    goalText: "Complexity, graphs, dynamic programming and interview prep.",
    axis: "subject",
    isPublic: true,
  },
  {
    slug: "grp-world-history",
    name: "World History",
    topic: "History",
    goalText: "Causes, consequences and essay structure.",
    axis: "subject",
    isPublic: true,
  },

  {
    slug: "grp-ap-calc-bc",
    name: "AP Calculus BC",
    topic: "AP Calculus BC",
    goalText: "Timed practice and free-response technique.",
    axis: "exam",
    isPublic: true,
  },
  {
    slug: "grp-ap-bio",
    name: "AP Biology",
    topic: "AP Biology",
    goalText: "Unit review and data-analysis questions.",
    axis: "exam",
    isPublic: true,
  },
  {
    slug: "grp-sat-math",
    name: "SAT Math",
    topic: "SAT Math",
    goalText: "Pacing drills and the question types that catch people out.",
    axis: "exam",
    isPublic: true,
  },
  {
    slug: "grp-tech-interview",
    name: "Technical Interview Prep",
    topic: "Interviews",
    goalText: "Mock interviews, complexity questions and talking through your reasoning.",
    axis: "exam",
    isPublic: true,
  },

  {
    slug: "grp-first-year",
    name: "First-Year Undergrads",
    topic: "General",
    goalText: "Adjusting to university-level workload.",
    axis: "grade",
    isPublic: true,
  },
  {
    slug: "grp-high-school",
    name: "High School",
    topic: "General",
    goalText: "Coursework, revision and exam season.",
    axis: "grade",
    isPublic: true,
  },

  {
    slug: "grp-night-shift",
    name: "Night Shift",
    topic: "General",
    goalText: "For people whose best hours are after midnight.",
    axis: "interest",
    isPublic: true,
  },
  {
    slug: "grp-streak-club",
    name: "Streak Club",
    topic: "General",
    goalText: "Daily accountability — one session a day, every day.",
    axis: "interest",
    isPublic: true,
  },
  {
    slug: "grp-maths-olympiad",
    name: "Maths Olympiad",
    topic: "Competition Maths",
    goalText: "Problems that do not have a formula to plug into.",
    axis: "interest",
    isPublic: true,
  },
];

/** Provenance summary, for asserting nothing is mis-attributed. */
export function contentAudit() {
  return {
    threads: SEED_THREADS.length,
    answers: SEED_THREADS.reduce((a, t) => a + (t.answers?.length ?? 0), 0),
    groups: SEED_GROUPS.length,
    author: TEAM,
    /** Every thread declares a non-member source. */
    allAttributed: SEED_THREADS.every((t) => t.source === "seed" || t.source === "official"),
    /** No fabricated engagement of any kind. */
    fabricatedVotes: 0,
    fabricatedMembers: 0,
    fabricatedAcceptedAnswers: 0,
    categories: [...new Set(SEED_THREADS.map((t) => t.category))].sort(),
  };
}
