// Milestone detection for XP thresholds and trophy road unlocks
import { ROAD_NODES, type MonsterArchetypeKey, type TierId } from "./trophy-road-data";
import { toast } from "sonner";

// XP milestone thresholds (beyond trophy road)
const XP_MILESTONES = [100, 500, 1000, 2500, 5000, 10000, 20000, 35000, 50000];

const XP_MESSAGES: Record<number, { title: string; desc: string }> = {
  100: { title: "First Steps! ✨", desc: "You've earned 100 XP - the journey has begun!" },
  500: { title: "Rising Star ⭐", desc: "500 XP! You're building real momentum." },
  1000: {
    title: "Knowledge Seeker 📚",
    desc: "1,000 XP - you're becoming a force to reckon with.",
  },
  2500: { title: "Battle Hardened ⚔️", desc: "2,500 XP! Your dedication is showing." },
  5000: { title: "Scholar Elite 🏅", desc: "5,000 XP - half the legends would envy you." },
  10000: { title: "Master Learner 🎓", desc: "10,000 XP! You've reached the top echelons." },
  20000: { title: "Legendary Mind 🧠", desc: "20,000 XP - wisdom radiates from you." },
  35000: { title: "Cosmic Intellect 🌌", desc: "35,000 XP! The universe bends to your knowledge." },
  50000: {
    title: "ECLIPTADON AWAKENS 🐉",
    desc: "50,000 XP - you've reached the pinnacle of all learning.",
  },
};

/**
 * Every lookup below is keyed on a node's typed field - `archetype`, `tier`,
 * `finalMonster` - rather than on its display label.
 *
 * They used to be keyed on the label, and the two sets had drifted completely
 * apart: the tier table still held "Bronze I" and "Gold I" while the road had
 * long since been renamed to "Dawn I" and "Meridian I", so not one of the
 * eight tier-up messages could ever fire. The archetype table had the same
 * problem on one entry ("God Archetype" against an actual label of "Eclipse
 * Archetype"). Keying on the unions makes that class of drift a build error:
 * rename a tier and this file stops compiling until it is updated too.
 */
const ARCHETYPE_MESSAGES: Record<MonsterArchetypeKey, string> = {
  speedster: "You've unlocked the Speedster! Lightning-fast reflexes, meet lightning-fast mind. ⚡",
  tank: "The Tank is yours! Nothing can stop you now. 🛡️",
  chud: "Apex joins your roster! Unpredictable and powerful. 🃏",
  gambler: "The Gambler emerges! Fortune favors the bold. 🎲",
  healer: "Healer unlocked! Knowledge heals all wounds. 💚",
  fulcrum: "The Fulcrum awakens! Balance of all forces. ⚖️",
  accelerator: "Accelerator online! Time bends to your will. 🚀",
  god: "The Eclipse Archetype is yours. You've transcended. 👑",
};

const FINAL_MESSAGES: Record<"newton" | "ecliptadon", string> = {
  newton: "🍎 NEWTON UNLOCKED - the gravity of your knowledge reshapes reality.",
  ecliptadon: "🐉 ECLIPTADON - the celestial destroyer acknowledges your mastery. You are LEGEND.",
};

const TIER_MESSAGES: Record<TierId, string> = {
  bronze: "Welcome to the arena, recruit. Dawn tier unlocked. 🥉",
  silver: "Moonrise tier! You're leaving the rookies behind. 🥈",
  gold: "Meridian tier - now we're talking. The real battles begin. 🥇",
  diamond: "Penumbra tier! You sparkle with knowledge. 💎",
  platinum: "Umbra tier! Only the elite reach this far. ✨",
  champion: "NIGHTFALL tier! The arena trembles at your name. 🏆",
  unreal: "TOTALITY tier! Beyond mortal comprehension. 🌟",
  god: "ECLIPSE TIER. You have ascended. 👁️",
};

/**
 * The first rank node of each tier - crossing one of these is what "reaching a
 * new tier" means. Derived rather than listed, so inserting a rank node cannot
 * silently move which one announces the tier.
 */
const TIER_OPENING_NODE_IDS: ReadonlySet<number> = new Set(
  Object.values(
    ROAD_NODES.reduce<Partial<Record<TierId, number>>>((firstOfTier, node) => {
      if (node.type === "rank" && firstOfTier[node.tier] === undefined) {
        firstOfTier[node.tier] = node.id;
      }
      return firstOfTier;
    }, {}),
  ).filter((id): id is number => id !== undefined),
);

// Track which milestones have been shown this session
const shownMilestones = new Set<string>();

/**
 * Check for newly reached milestones given previous and current XP.
 * Returns Luna chat messages for any new milestones.
 */
export function checkMilestones(
  prevXp: number,
  currentXp: number,
): { toasts: { title: string; description: string }[]; lunaMessages: string[] } {
  const toasts: { title: string; description: string }[] = [];
  const lunaMessages: string[] = [];

  // Check XP milestones
  for (const threshold of XP_MILESTONES) {
    const key = `xp-${threshold}`;
    if (prevXp < threshold && currentXp >= threshold && !shownMilestones.has(key)) {
      shownMilestones.add(key);
      const msg = XP_MESSAGES[threshold];
      if (msg) {
        toasts.push({ title: msg.title, description: msg.desc });
        lunaMessages.push(`🎉 **Milestone: ${msg.title}** - ${msg.desc}`);
      }
    }
  }

  // Check trophy road node unlocks
  for (const node of ROAD_NODES) {
    const key = `node-${node.id}`;
    if (prevXp < node.xp && currentXp >= node.xp && !shownMilestones.has(key)) {
      shownMilestones.add(key);

      if (node.type === "monster" && node.archetype) {
        const msg = ARCHETYPE_MESSAGES[node.archetype];
        toasts.push({ title: `🐲 ${node.label} Unlocked!`, description: msg });
        lunaMessages.push(msg);
      } else if (node.type === "final" && node.finalMonster) {
        const msg = FINAL_MESSAGES[node.finalMonster];
        toasts.push({ title: `🐲 ${node.label} Unlocked!`, description: msg });
        lunaMessages.push(msg);
      } else if (node.type === "rank" && TIER_OPENING_NODE_IDS.has(node.id)) {
        const msg = TIER_MESSAGES[node.tier];
        toasts.push({ title: `🏅 ${node.label}`, description: msg });
        lunaMessages.push(msg);
      } else if (node.type === "chest") {
        toasts.push({
          title: `🎁 ${node.label} ready`,
          description: "Open it on the Trophy Road to claim your bonus.",
        });
      }
    }
  }

  return { toasts, lunaMessages };
}

/** Fire toast notifications for milestones */
export function fireMilestoneToasts(milestoneToasts: { title: string; description: string }[]) {
  milestoneToasts.forEach((t, i) => {
    setTimeout(() => {
      toast(t.title, {
        description: t.description,
        duration: 6000,
        className: "milestone-toast",
        action: {
          label: "View Progress",
          onClick: () => {
            window.location.href = "/progress";
          },
        },
      });
    }, i * 1500); // Stagger toasts
  });
}

/** Get all milestones already achieved at a given XP (for initial load) */
let lastMarkedXp = -1;
export function markExistingMilestones(currentXp: number) {
  // Both Luna panels mount useXpMilestones, so this runs twice on a typical
  // page. The shownMilestones Set is module-level (correct), but re-walking
  // the thresholds on every mount is pure waste - short-circuit when we've
  // already marked at or above the current XP.
  if (lastMarkedXp >= currentXp) return;
  lastMarkedXp = currentXp;
  for (const threshold of XP_MILESTONES) {
    if (currentXp >= threshold) shownMilestones.add(`xp-${threshold}`);
  }
  for (const node of ROAD_NODES) {
    if (currentXp >= node.xp) shownMilestones.add(`node-${node.id}`);
  }
}
