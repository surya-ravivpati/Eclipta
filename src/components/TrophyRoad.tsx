import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Lock, Star, CheckCircle, Crown, Zap, Shield, Skull,
  Dice5, Heart, Scale, TrendingUp, Sparkles, Trophy, Gift,
  Apple, Atom,
  // Per-tier rank icons
  Hammer, Swords, Medal, Gem, Diamond as DiamondIcon, Flame, Sparkle, Sun,
  ChevronDown,
} from "lucide-react";

// Distinct icon per rank tier (used for "rank" road nodes)
const TIER_ICONS: Record<TierId, typeof Crown> = {
  bronze: Hammer,
  silver: Swords,
  gold: Medal,
  diamond: DiamondIcon,
  platinum: Gem,
  champion: Flame,
  unreal: Sparkle,
  god: Sun,
};
import { cn } from "@/lib/utils";
import {
  ROAD_NODES as RAW_NODES,
  type TierId,
  type MonsterArchetypeKey,
  type RoadNode as BaseRoadNode,
} from "@/lib/trophy-road-data";
import { usePlayerXp, useOwnedEcliptars } from "@/hooks/use-player-xp";
import { claimArchetypeReward, claimEcliptarBySlug, getEcliptarsByArchetype } from "@/lib/ecliptars";
import { claimChest, fetchClaimedChestNodeIds, CHEST_BONUS_XP } from "@/lib/xp-service";

/* ── Tier shadow OKLCH values for Framer Motion boxShadow ──── */
const TIER_SHADOW: Record<TierId, string> = {
  bronze:   "0.6 0.12 55",
  silver:   "0.72 0.02 260",
  gold:     "0.75 0.16 85",
  diamond:  "0.7 0.18 240",
  platinum: "0.8 0.1 190",
  champion: "0.65 0.22 25",
  unreal:   "0.6 0.28 310",
  god:      "0.85 0.12 90",
};

/* ── Types ─────────────────────────────────────────────────── */

type ArchetypeKey = MonsterArchetypeKey;

interface RoadNode extends BaseRoadNode {
  unlocked: boolean;
  current: boolean;
}

interface RankTier {
  id: TierId;
  name: string;
  xpRequired: number;
  colorClass: string;
  bgClass: string;
  glowClass: string;
  borderClass: string;
  description: string;
}

interface MonsterArchetype {
  id: ArchetypeKey;
  name: string;
  emoji: string;
  icon: typeof Zap;
  stats: { health: string; time: string; damage: string; multiplier: string; difficulty: string };
  special?: string;
  colorClass: string;
}

interface RoadNode {
  id: number;
  tier: TierId;
  type: "rank" | "monster" | "chest" | "boss" | "final";
  label: string;
  xp: number;
  archetype?: ArchetypeKey;
  unlocked: boolean;
  current: boolean;
  finalMonster?: "newton" | "ecliptadon";
}

/* ── Data ──────────────────────────────────────────────────── */

const TIERS: Record<TierId, RankTier> = {
  bronze:   { id: "bronze",   name: "Bronze",    xpRequired: 0,      colorClass: "text-tier-bronze",   bgClass: "bg-tier-bronze",   glowClass: "neon-glow-bronze",   borderClass: "border-tier-bronze/40",   description: "Rugged stone, warm glow" },
  silver:   { id: "silver",   name: "Silver",    xpRequired: 1000,   colorClass: "text-tier-silver",   bgClass: "bg-tier-silver",   glowClass: "neon-glow-silver",   borderClass: "border-tier-silver/40",   description: "Sleek metal, cool shine" },
  gold:     { id: "gold",     name: "Gold",      xpRequired: 3000,   colorClass: "text-tier-gold",     bgClass: "bg-tier-gold",     glowClass: "neon-glow-gold",     borderClass: "border-tier-gold/40",     description: "Radiant, sparkling" },
  diamond:  { id: "diamond",  name: "Diamond",   xpRequired: 6000,   colorClass: "text-tier-diamond",  bgClass: "bg-tier-diamond",  glowClass: "neon-glow-diamond",  borderClass: "border-tier-diamond/40",  description: "Crystalline, blue energy" },
  platinum: { id: "platinum", name: "Platinum",  xpRequired: 10000,  colorClass: "text-tier-platinum", bgClass: "bg-tier-platinum", glowClass: "neon-glow-platinum", borderClass: "border-tier-platinum/40", description: "Futuristic white/teal" },
  champion: { id: "champion", name: "Champion",  xpRequired: 16000,  colorClass: "text-tier-champion", bgClass: "bg-tier-champion", glowClass: "neon-glow-champion", borderClass: "border-tier-champion/40", description: "Fiery, heroic aura" },
  unreal:   { id: "unreal",   name: "Unreal",    xpRequired: 25000,  colorClass: "text-tier-unreal",   bgClass: "bg-tier-unreal",   glowClass: "neon-glow-unreal",   borderClass: "border-tier-unreal/40",   description: "Cosmic, glitchy, surreal" },
  god:      { id: "god",      name: "God Tier",  xpRequired: 40000,  colorClass: "text-tier-god",      bgClass: "bg-tier-god",      glowClass: "neon-glow-god",      borderClass: "border-tier-god/40",      description: "Divine light, heavenly" },
};

const ARCHETYPES: Record<ArchetypeKey, MonsterArchetype> = {
  speedster:    { id: "speedster",    name: "Speedster",    emoji: "⚡", icon: Zap,        stats: { health: "Mid", time: "Low", damage: "Mid", multiplier: "High", difficulty: "Mid" },    colorClass: "text-neon-cyan" },
  tank:         { id: "tank",         name: "Tank",         emoji: "🛡️", icon: Shield,     stats: { health: "High", time: "High", damage: "Low", multiplier: "None", difficulty: "Mid" },   colorClass: "text-tier-silver" },
  chud:         { id: "chud",         name: "Chud",         emoji: "😵", icon: Skull,       stats: { health: "Low", time: "Low", damage: "Ultra High", multiplier: "None", difficulty: "High" }, colorClass: "text-tier-champion" },
  gambler:      { id: "gambler",      name: "Gambler",      emoji: "🎰", icon: Dice5,       stats: { health: "Random", time: "Random", damage: "Random", multiplier: "Random", difficulty: "Random" }, colorClass: "text-tier-gold" },
  healer:       { id: "healer",       name: "Healer",       emoji: "✨", icon: Heart,       stats: { health: "Low", time: "Mid", damage: "Low", multiplier: "Mid", difficulty: "Mid" },     special: "Can heal instead of attacking", colorClass: "text-neon-pink" },
  fulcrum:      { id: "fulcrum",      name: "Fulcrum",      emoji: "⚖️", icon: Scale,       stats: { health: "Mid", time: "Mid", damage: "Mid", multiplier: "Mid", difficulty: "Mid" },     colorClass: "text-neon-purple" },
  accelerator:  { id: "accelerator",  name: "Accelerator",  emoji: "⏩", icon: TrendingUp,  stats: { health: "Low", time: "Mid", damage: "Scaling", multiplier: "None", difficulty: "Mid" }, special: "Damage increases every turn", colorClass: "text-tier-platinum" },
  god:          { id: "god",          name: "God",          emoji: "👑", icon: Crown,       stats: { health: "High", time: "High", damage: "High", multiplier: "High", difficulty: "High" }, colorClass: "text-tier-god" },
};

// Derive enriched nodes from shared data based on live player XP
function deriveNodes(playerXp: number): RoadNode[] {
  return RAW_NODES.map((node, i, arr) => {
    const unlocked = node.xp <= playerXp;
    const nextNode = arr[i + 1];
    const current = unlocked && (!nextNode || nextNode.xp > playerXp);
    return { ...node, unlocked, current };
  });
}

/* ── Tier Background ───────────────────────────────────────── */

/* ── Node Component ────────────────────────────────────────── */

function RoadNodeItem({ node, index, ownedSlugs, claimedChestIds, onClaimed, onChestClaimed }: {
  node: RoadNode;
  index: number;
  ownedSlugs: Set<string>;
  claimedChestIds: Set<number>;
  onClaimed: () => void;
  onChestClaimed: () => void;
}) {
  const tier = TIERS[node.tier];
  const archetype = node.archetype ? ARCHETYPES[node.archetype] : null;
  const [hovered, setHovered] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [openingChest, setOpeningChest] = useState(false);

  // Determine if this monster node has unclaimed Ecliptars
  const isClaimable = node.type === "monster" && node.archetype && node.unlocked;
  const requiredSlugs = node.archetype ? getEcliptarsByArchetype(node.archetype).map(e => e.slug) : [];
  const allOwned = requiredSlugs.length > 0 && requiredSlugs.every(s => ownedSlugs.has(s));
  const showClaim = isClaimable && !allOwned;

  // Final-boss nodes (Newton / Ecliptadon) each grant a single God-archetype Ecliptar
  const finalSlug = node.type === "final" ? node.finalMonster ?? null : null;
  const finalOwned = finalSlug ? ownedSlugs.has(finalSlug) : false;
  const showFinalClaim = node.type === "final" && node.unlocked && !!finalSlug && !finalOwned;

  const isChest = node.type === "chest";
  const chestClaimed = isChest && claimedChestIds.has(node.id);
  const showChestOpen = isChest && node.unlocked && !chestClaimed;

  const handleClaim = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!node.archetype || claiming) return;
    setClaiming(true);
    const granted = await claimArchetypeReward(node.archetype, node.id);
    setClaiming(false);
    if (granted.length > 0) {
      toast(`🎉 ${ARCHETYPES[node.archetype].name} Ecliptars unlocked!`, {
        description: `You now own ${granted.map(g => g.name).join(" & ")} for battle.`,
        duration: 6000,
        action: {
          label: "View in Profile",
          onClick: () => { window.location.href = "/profile"; },
        },
      });
      onClaimed();
    }
  };

  const handleClaimFinal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!finalSlug || claiming) return;
    setClaiming(true);
    const granted = await claimEcliptarBySlug(finalSlug, node.id);
    setClaiming(false);
    if (granted) {
      toast(`👑 ${granted.name} unlocked!`, {
        description: `Equip ${granted.name} in your profile to wield the God archetype in battle.`,
        duration: 6000,
        action: {
          label: "View in Profile",
          onClick: () => { window.location.href = "/profile"; },
        },
      });
      onClaimed();
    }
  };

  const handleOpenChest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isChest || openingChest) return;
    setOpeningChest(true);
    const bonus = await claimChest(node.id, node.label);
    setOpeningChest(false);
    if (bonus > 0) {
      toast(`📦 ${node.label} opened!`, {
        description: `+${bonus} bonus XP added to your total.`,
        duration: 6000,
      });
      onChestClaimed();
    } else {
      toast("Couldn't open chest", { description: "It may already be claimed." });
    }
  };

  const isFinal = node.type === "final";
  const nodeSize = isFinal ? "w-20 h-20" : node.type === "rank" ? "w-14 h-14" : "w-12 h-12";

  const getNodeIcon = () => {
    if (node.type === "final") {
      const FinalIcon = node.finalMonster === "newton" ? Apple : Atom;
      return <FinalIcon className="w-7 h-7" />;
    }
    if (node.type === "rank") {
      const RankIcon = TIER_ICONS[node.tier] ?? Crown;
      return <RankIcon className="w-5 h-5" />;
    }
    if (node.type === "chest") return <Gift className="w-5 h-5" />;
    if (node.type === "monster" && archetype) {
      const Icon = archetype.icon;
      return <Icon className="w-5 h-5" />;
    }
    return <Star className="w-4 h-4" />;
  };

  // Zigzag vertical offset for visual interest
  const yOffset = Math.sin(index * 0.8) * 20;

  return (
    <motion.div
      className="relative flex flex-col items-center shrink-0"
      style={{ marginTop: yOffset }}
      initial={{ opacity: 0, scale: 0.5, y: 16 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay: index * 0.035, type: "spring", stiffness: 320, damping: 24 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* XP label */}
      <motion.span
        className={cn(
          "text-[10px] font-mono mb-1.5 transition-opacity",
          node.unlocked ? tier.colorClass : "text-muted-foreground/50"
        )}
        animate={{ opacity: hovered ? 1 : 0.7 }}
      >
        {node.xp.toLocaleString()} XP
      </motion.span>

      {/* Node circle */}
      <motion.div
        className={cn(
          "relative rounded-full flex items-center justify-center cursor-pointer transition-all duration-300",
          nodeSize,
          node.current
            ? `${tier.bgClass} ${tier.glowClass} ring-4 ring-white/20`
            : node.unlocked
            ? `${tier.bgClass} ${tier.glowClass}`
            : "bg-secondary/80 border-2 border-border"
        )}
        whileHover={{ scale: node.unlocked ? 1.15 : 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={node.current ? {
          boxShadow: [
            `0 0 20px oklch(${TIER_SHADOW[node.tier]} / 40%)`,
            `0 0 48px oklch(${TIER_SHADOW[node.tier]} / 70%)`,
            `0 0 20px oklch(${TIER_SHADOW[node.tier]} / 40%)`,
          ]
        } : {}}
        transition={node.current ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : {}}
      >
        {/* Locked overlay */}
        {!node.unlocked && (
          <div className="absolute inset-0 rounded-full bg-background/60 flex items-center justify-center z-10">
            <Lock className="w-4 h-4 text-muted-foreground" />
          </div>
        )}

        {/* Icon */}
        <span className={cn(
          "relative z-[5]",
          node.unlocked ? "text-primary-foreground" : "opacity-30",
          isFinal && "text-2xl"
        )}>
          {getNodeIcon()}
        </span>

        {/* Current indicator */}
        {node.current && (
          <motion.div
            className="absolute -inset-2 rounded-full border-2 border-white/30"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}

        {/* Completed checkmark */}
        {node.unlocked && !node.current && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center z-20">
            <CheckCircle className="w-3 h-3 text-white" />
          </div>
        )}
      </motion.div>

      {/* Label */}
      <motion.span
        className={cn(
          "text-[11px] font-display font-bold mt-2 text-center max-w-[80px] leading-tight",
          node.current ? "text-foreground" : node.unlocked ? tier.colorClass : "text-muted-foreground/50"
        )}
      >
        {node.label}
      </motion.span>

      {/* Claim button for unlocked monster nodes */}
      {showClaim && (
        <motion.button
          onClick={handleClaim}
          disabled={claiming}
          className={cn(
            "mt-1.5 px-2 py-0.5 text-[9px] font-bold tracking-widest rounded-full",
            "bg-neon-pink text-primary-foreground border border-neon-pink/60",
            "hover:opacity-90 transition-opacity disabled:opacity-50"
          )}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
        >
          {claiming ? "..." : "CLAIM"}
        </motion.button>
      )}
      {isClaimable && allOwned && (
        <span className="mt-1 text-[9px] text-emerald-400 font-bold tracking-widest">CLAIMED</span>
      )}

      {showFinalClaim && (
        <motion.button
          onClick={handleClaimFinal}
          disabled={claiming}
          className={cn(
            "mt-1.5 px-2 py-0.5 text-[9px] font-bold tracking-widest rounded-full",
            "bg-tier-god text-primary-foreground border border-tier-god/60",
            "hover:opacity-90 transition-opacity disabled:opacity-50"
          )}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
        >
          {claiming ? "..." : "CLAIM"}
        </motion.button>
      )}
      {node.type === "final" && finalSlug && finalOwned && (
        <span className="mt-1 text-[9px] text-emerald-400 font-bold tracking-widest">CLAIMED</span>
      )}

      {/* Open button for chest nodes */}
      {showChestOpen && (
        <motion.button
          onClick={handleOpenChest}
          disabled={openingChest}
          className={cn(
            "mt-1.5 px-2 py-0.5 text-[9px] font-bold tracking-widest rounded-full",
            "bg-tier-gold text-primary-foreground border border-tier-gold/60",
            "hover:opacity-90 transition-opacity disabled:opacity-50"
          )}
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.95 }}
          title={`+${CHEST_BONUS_XP[node.label] ?? 0} bonus XP`}
        >
          {openingChest ? "..." : "OPEN"}
        </motion.button>
      )}
      {isChest && chestClaimed && (
        <span className="mt-1 text-[9px] text-emerald-400 font-bold tracking-widest">OPENED</span>
      )}

      {/* Hover tooltip */}
      {hovered && archetype && (
        <motion.div
          className={cn(
            "absolute -top-32 left-1/2 -translate-x-1/2 glass-panel rounded-xl p-3 z-50 w-52",
            tier.borderClass, "border"
          )}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <archetype.icon className={cn("w-5 h-5", archetype.colorClass)} />
            <div>
              <p className={cn("font-display font-bold text-sm", archetype.colorClass)}>{archetype.name}</p>
              {archetype.special && <p className="text-[9px] text-neon-pink italic">{archetype.special}</p>}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1 text-[9px] text-center">
            {Object.entries(archetype.stats).map(([key, val]) => (
              <div key={key}>
                <p className="text-muted-foreground uppercase">{key.slice(0, 3)}</p>
                <p className={cn("font-bold", archetype.colorClass)}>{val}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Final monster special effects */}
      {isFinal && node.finalMonster === "ecliptadon" && (
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            boxShadow: [
              "0 0 30px oklch(0.85 0.12 90 / 30%), 0 0 60px oklch(0.55 0.25 290 / 20%)",
              "0 0 50px oklch(0.85 0.12 90 / 50%), 0 0 100px oklch(0.55 0.25 290 / 30%)",
              "0 0 30px oklch(0.85 0.12 90 / 30%), 0 0 60px oklch(0.55 0.25 290 / 20%)",
            ]
          }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

/* ── Road Connector ────────────────────────────────────────── */

function RoadConnector({ from, to: _to }: { from: RoadNode; to: RoadNode }) {
  const unlocked = from.unlocked;
  const tier = TIERS[from.tier];

  return (
    <div className="flex items-center shrink-0 self-center">
      <div className="w-8 h-1 rounded-full overflow-hidden bg-border/30">
        {unlocked && (
          <motion.div
            className={cn("h-full rounded-full", tier.bgClass)}
            initial={{ scaleX: 0, opacity: 0 }}
            whileInView={{ scaleX: 1, opacity: 0.65 }}
            viewport={{ once: true }}
            style={{ transformOrigin: "left" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </div>
    </div>
  );
}

/* ── Tier Separator ────────────────────────────────────────── */

function TierSeparator({ tier }: { tier: RankTier }) {
  return (
    <motion.div
      className="flex flex-col items-center shrink-0 mx-2"
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
    >
      <div className={cn(
        "px-3 py-1 rounded-full text-[10px] font-display font-bold uppercase tracking-widest border",
        tier.colorClass, tier.borderClass, tier.glowClass
      )}>
        {tier.name}
      </div>
      <div className={cn("w-px h-4 mt-1", `bg-current opacity-30`, tier.colorClass)} />
    </motion.div>
  );
}

/* ── Archetype Legend ──────────────────────────────────────── */

function ArchetypeLegend() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
      {Object.values(ARCHETYPES).map((a) => (
        <motion.div
          key={a.id}
          className="glass-panel rounded-xl p-3 border border-border hover:border-white/15 transition-colors"
          whileHover={{ scale: 1.02 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <a.icon className={cn("w-5 h-5", a.colorClass)} />
            <span className={cn("font-display font-bold text-xs", a.colorClass)}>{a.name}</span>
          </div>
          <div className="grid grid-cols-5 gap-0.5 text-[8px] text-center">
            {Object.entries(a.stats).map(([key, val]) => (
              <div key={key}>
                <p className="text-muted-foreground uppercase">{key.slice(0, 3)}</p>
                <p className="text-foreground font-mono font-bold">{val}</p>
              </div>
            ))}
          </div>
          {a.special && (
            <p className="text-[9px] text-neon-pink mt-1.5 italic">✦ {a.special}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/* ── Progress Bar ──────────────────────────────────────────── */

function ProgressOverview({ playerXp }: { playerXp: number }) {
  const currentTier = Object.values(TIERS).reverse().find(t => playerXp >= t.xpRequired) || TIERS.bronze;
  const nextTier = Object.values(TIERS).find(t => t.xpRequired > playerXp);
  const progressInTier = nextTier
    ? ((playerXp - currentTier.xpRequired) / (nextTier.xpRequired - currentTier.xpRequired)) * 100
    : 100;

  return (
    <motion.div
      className="glass-panel rounded-2xl p-6 mb-8 border border-border"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", currentTier.bgClass, currentTier.glowClass)}>
            <Crown className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <p className={cn("font-display font-bold text-lg", currentTier.colorClass)}>
              {currentTier.name}
            </p>
            <p className="text-xs text-muted-foreground">{playerXp.toLocaleString()} XP Total</p>
          </div>
        </div>
        {nextTier && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Next: <span className={nextTier.colorClass}>{nextTier.name}</span></p>
            <p className="text-xs font-mono text-muted-foreground">{(nextTier.xpRequired - playerXp).toLocaleString()} XP to go</p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", currentTier.bgClass)}
          initial={{ width: 0 }}
          animate={{ width: `${progressInTier}%` }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
        {/* XP shimmer sweep — signals active progression */}
        <motion.div
          className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"
          animate={{ x: ["-100%", "600%"] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear", repeatDelay: 3.5 }}
        />
      </div>

      {/* Tier indicators */}
      <div className="flex justify-between mt-3">
        {Object.values(TIERS).map((t) => (
          <div
            key={t.id}
            className={cn(
              "text-[9px] font-display font-bold",
              playerXp >= t.xpRequired ? t.colorClass : "text-muted-foreground/40"
            )}
          >
            {t.name.slice(0, 3)}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Final Monsters ────────────────────────────────────────── */

function FinalMonsters() {
  return (
    <div className="grid md:grid-cols-2 gap-6 mt-10">
      {/* Newton */}
      <motion.div
        className="relative glass-panel rounded-2xl p-6 border border-tier-god/30 overflow-hidden group"
        initial={{ opacity: 0, x: -30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        whileHover={{ scale: 1.01 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-tier-god/10 via-transparent to-neon-purple/5" />
        <Apple className="absolute top-2 right-2 opacity-10 w-32 h-32 text-tier-god" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-xl bg-tier-god neon-glow-god flex items-center justify-center text-primary-foreground">
              <Apple className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-display font-bold text-xl text-tier-god text-glow-god">Newton</h4>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Divine · Cosmic Being</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A divine, cosmic being holding an apple. Embodies gravity, intelligence, space, and ultimate knowledge.
          </p>
          <div className="flex gap-2 mt-3">
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-tier-god/20 text-tier-god font-mono">48,000 XP</span>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-neon-purple/20 text-neon-purple font-mono">LEGENDARY</span>
          </div>
        </div>
      </motion.div>

      {/* ECLIPTADON */}
      <motion.div
        className="relative glass-panel rounded-2xl p-6 border border-neon-purple/30 overflow-hidden group"
        initial={{ opacity: 0, x: 30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        whileHover={{ scale: 1.01 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-neon-purple/10 via-transparent to-tier-champion/5" />
        <Atom className="absolute top-2 right-2 opacity-10 w-32 h-32 text-neon-purple" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-xl bg-neon-purple neon-glow-purple flex items-center justify-center text-primary-foreground">
              <Atom className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-display font-bold text-xl text-neon-purple text-glow-purple">ECLIPTADON</h4>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Celestial · Ancient Power</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A massive celestial dinosaur in radiant armor. Ancient power, cosmic destruction incarnate.
          </p>
          <div className="flex gap-2 mt-3">
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-neon-purple/20 text-neon-purple font-mono">50,000 XP</span>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-tier-champion/20 text-tier-champion font-mono">MYTHICAL</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Main TrophyRoad ───────────────────────────────────────── */

export function TrophyRoad({ compact = false }: { compact?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { xp: playerXp } = usePlayerXp();
  const { slugs: ownedSlugs, refresh: refreshOwned } = useOwnedEcliptars();
  const [claimedChestIds, setClaimedChestIds] = useState<Set<number>>(new Set());
  const refreshChests = async () => setClaimedChestIds(await fetchClaimedChestNodeIds());
  useEffect(() => { void refreshChests(); }, []);

  const ROAD_NODES = deriveNodes(playerXp);

  // Group nodes by tier
  let lastTier: TierId | null = null;

  if (compact) {
    // Compact version for homepage
    return (
      <section className="py-24 border-t border-border bg-card/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl font-bold mb-6 font-display">
                Your <span className="text-neon-purple text-glow-purple">Trophy Road</span>
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Rise from Bronze to God Tier. Unlock Ecliptars, earn rewards, and ascend through
                8 ranks — each with a distinct visual world and exclusive Ecliptars to collect.
              </p>
              <div className="space-y-3">
                {Object.values(TIERS).slice(0, 4).map((t) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <div className={cn("w-3 h-3 rounded-sm", t.bgClass)} />
                    <span className={cn("text-sm font-display font-bold", t.colorClass)}>{t.name}</span>
                    <span className="text-xs text-muted-foreground">— {t.description}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pl-6 italic">…and 4 more legendary tiers</p>
              </div>
            </motion.div>

            {/* Mini road preview */}
            <motion.div
              className="glass-panel rounded-2xl p-6 relative overflow-hidden"
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-neon-purple/5 to-transparent" />
              <div className="relative flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {ROAD_NODES.slice(0, 12).map((node, i) => (
                  <div key={node.id} className="flex items-center gap-1.5 shrink-0">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs",
                      node.unlocked
                        ? `${TIERS[node.tier].bgClass} ${TIERS[node.tier].glowClass}`
                        : "bg-secondary border border-border"
                    )}>
                      {node.unlocked ? (
                        node.type === "monster" && node.archetype ? (
                          (() => { const I = ARCHETYPES[node.archetype].icon; return <I className="w-3.5 h-3.5" />; })()
                        ) : node.type === "chest" ? <Gift className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />
                      ) : (
                        <Lock className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                    {i < 11 && (
                      <div className={cn("w-3 h-0.5 rounded-full", node.unlocked ? TIERS[node.tier].bgClass : "bg-border/30")} />
                    )}
                  </div>
                ))}
                <span className="text-xs text-muted-foreground shrink-0 ml-2">+13 more →</span>
              </div>
              <div className="relative mt-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Current Rank</p>
                  <p className="font-display font-bold text-tier-gold text-glow-gold">Gold I</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">XP</p>
                  <p className="font-mono font-bold text-foreground">{playerXp.toLocaleString()}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    );
  }

  // Full version for progress page
  return (
    <div>
      <ProgressOverview playerXp={playerXp} />

      {/* PRIMARY: Scrollable Road — the core action */}
      <div className="glass-panel rounded-2xl p-6 border border-border overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-tier-gold" />
          <h3 className="font-display font-bold text-lg">Your Progression Road</h3>
          <span className="text-xs text-muted-foreground ml-auto">← Scroll to explore →</span>
        </div>
        <div className="flex flex-wrap gap-3 mb-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-neon-pink animate-pulse" /> You are here</span>
          <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-500" /> Cleared</span>
          <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Locked — unlocks at listed XP</span>
        </div>

        <div
          ref={scrollRef}
          className="overflow-x-auto pb-4 scrollbar-hide"
        >
          <div className="flex items-end gap-1 min-w-max px-4 py-8">
            {ROAD_NODES.map((node, i) => {
              const showTierSep = node.tier !== lastTier;
              lastTier = node.tier;
              return (
                <div key={node.id} className="flex items-end gap-1">
                  {showTierSep && <TierSeparator tier={TIERS[node.tier]} />}
                  <RoadNodeItem
                    node={node}
                    index={i}
                    ownedSlugs={ownedSlugs}
                    claimedChestIds={claimedChestIds}
                    onClaimed={refreshOwned}
                    onChestClaimed={() => { void refreshChests(); }}
                  />
                  {i < ROAD_NODES.length - 1 && <RoadConnector from={node} to={ROAD_NODES[i + 1]} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tier color gradient bar */}
        <div className="flex h-1.5 rounded-full overflow-hidden mt-2">
          {Object.values(TIERS).map((t) => (
            <div key={t.id} className={cn("flex-1", t.bgClass)} />
          ))}
        </div>
      </div>

      {/* SECONDARY: collapsible details */}
      <details className="group mt-6 glass-panel rounded-2xl border border-border overflow-hidden">
        <summary className="flex items-center gap-2 p-4 cursor-pointer list-none hover:bg-white/[0.02]">
          <Sparkles className="w-4 h-4 text-neon-pink" />
          <span className="font-display font-bold text-sm tracking-widest uppercase">How the Trophy Road works</span>
          <ChevronDown className="w-4 h-4 ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
          Earn XP through battles, lessons, and tests to climb 8 ranks — Bronze to God Tier.
          Each stop on the road is an <span className="text-neon-purple font-bold">Ecliptar</span>,
          a <span className="text-neon-pink font-bold">reward chest</span>, or a
          <span className="text-tier-gold font-bold"> rank promotion</span>.
          Defeat Ecliptars to claim them and equip one in battle.
        </div>
      </details>

      <details className="group mt-3 glass-panel rounded-2xl border border-border overflow-hidden">
        <summary className="flex items-center gap-2 p-4 cursor-pointer list-none hover:bg-white/[0.02]">
          <Sparkles className="w-4 h-4 text-neon-purple" />
          <span className="font-display font-bold text-sm tracking-widest uppercase">Ecliptar Archetypes</span>
          <ChevronDown className="w-4 h-4 ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5">
          <p className="text-sm text-muted-foreground mb-3">
            Each icon on the road belongs to one of these archetypes.
          </p>
          <ArchetypeLegend />
        </div>
      </details>

      <details className="group mt-3 glass-panel rounded-2xl border border-border overflow-hidden">
        <summary className="flex items-center gap-2 p-4 cursor-pointer list-none hover:bg-white/[0.02]">
          <Crown className="w-4 h-4 text-tier-god" />
          <span className="font-display font-bold text-sm tracking-widest uppercase text-tier-god">End-Game Bosses</span>
          <ChevronDown className="w-4 h-4 ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5">
          <p className="text-sm text-muted-foreground mb-4">
            At the peak of the road — two legendary bosses await once you reach God Tier.
          </p>
          <FinalMonsters />
        </div>
      </details>
    </div>
  );
}
