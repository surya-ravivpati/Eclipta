import { motion, AnimatePresence } from "framer-motion";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Lock, CheckCircle, Crown, Zap, Shield, Skull,
  Dice5, Heart, Scale, TrendingUp, Sparkles, Gift,
  Apple, Atom,
  Hammer, Swords, Medal, Gem, Diamond as DiamondIcon, Flame, Sparkle, Sun,
  Star,
} from "lucide-react";
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
import "./TrophyRoad.css";

/* ── Per-tier rank icon (used for "rank" nodes) ─────────────── */
const TIER_ICONS: Record<TierId, typeof Crown> = {
  bronze: Hammer, silver: Swords, gold: Medal, diamond: DiamondIcon,
  platinum: Gem, champion: Flame, unreal: Sparkle, god: Sun,
};

const TIER_ORDER: TierId[] = ["bronze", "silver", "gold", "diamond", "platinum", "champion", "unreal", "god"];

type ArchetypeKey = MonsterArchetypeKey;
interface RoadNode extends BaseRoadNode {
  unlocked: boolean;
  current: boolean;
}

/* ── Tier metadata (XP + editorial copy) ────────────────────── */

interface TierMeta {
  id: TierId;
  name: string;
  label: string;        // serif sub-label, e.g. "Origin"
  description: string;
  xpRequired: number;
}

const TIERS: Record<TierId, TierMeta> = {
  bronze:   { id: "bronze",   name: "Bronze",   label: "Origin",          description: "Where every ascent begins. Foundations of form, focus, and pace.",        xpRequired:      0 },
  silver:   { id: "silver",   name: "Silver",   label: "Apprentice",      description: "Steady iteration sharpens the edge. The first taste of real discipline.", xpRequired:   7500 },
  gold:     { id: "gold",     name: "Gold",     label: "Crucible",        description: "Pressure shapes precision. Reward follows resolve.",                       xpRequired:  20000 },
  diamond:  { id: "diamond",  name: "Diamond",  label: "Resonance",       description: "Mastery solidifies. Patterns crystallize into instinct.",                  xpRequired:  43000 },
  platinum: { id: "platinum", name: "Platinum", label: "Architect",       description: "Output becomes signature. The craft starts to look like art.",            xpRequired:  78000 },
  champion: { id: "champion", name: "Champion", label: "Vanguard",        description: "Carry the standard. Set the curve everyone else chases.",                 xpRequired: 145000 },
  unreal:   { id: "unreal",   name: "Unreal",   label: "Transcendence",   description: "Beyond competition. Solo on an axis few will ever touch.",                xpRequired: 265000 },
  god:      { id: "god",      name: "God",      label: "Apotheosis",      description: "The final form. Where Newton and Ecliptadon wait at the threshold.",      xpRequired: 460000 },
};

/* ── Archetypes ────────────────────────────────────────────── */

interface MonsterArchetype {
  id: ArchetypeKey;
  name: string;
  icon: typeof Zap;
  stats: { health: string; time: string; damage: string; multiplier: string; difficulty: string };
  special?: string;
}

const ARCHETYPES: Record<ArchetypeKey, MonsterArchetype> = {
  speedster:    { id: "speedster",    name: "Speedster",    icon: Zap,        stats: { health: "Mid",  time: "Low",  damage: "Mid",        multiplier: "High",   difficulty: "Mid"    } },
  tank:         { id: "tank",         name: "Tank",         icon: Shield,     stats: { health: "High", time: "High", damage: "Low",        multiplier: "None",   difficulty: "Mid"    } },
  chud:         { id: "chud",         name: "Chud",         icon: Skull,      stats: { health: "Low",  time: "Low",  damage: "Ultra High", multiplier: "None",   difficulty: "High"   } },
  gambler:      { id: "gambler",      name: "Gambler",      icon: Dice5,      stats: { health: "Rand", time: "Rand", damage: "Rand",       multiplier: "Rand",   difficulty: "Rand"   } },
  healer:       { id: "healer",       name: "Healer",       icon: Heart,      stats: { health: "Low",  time: "Mid",  damage: "Low",        multiplier: "Mid",    difficulty: "Mid"    }, special: "Can heal instead of attacking" },
  fulcrum:      { id: "fulcrum",      name: "Fulcrum",      icon: Scale,      stats: { health: "Mid",  time: "Mid",  damage: "Mid",        multiplier: "Mid",    difficulty: "Mid"    } },
  accelerator:  { id: "accelerator",  name: "Accelerator",  icon: TrendingUp, stats: { health: "Low",  time: "Mid",  damage: "Scaling",    multiplier: "None",   difficulty: "Mid"    }, special: "Damage increases every turn" },
  god:          { id: "god",          name: "God",          icon: Crown,      stats: { health: "High", time: "High", damage: "High",       multiplier: "High",   difficulty: "High"   } },
};

/* ── Derive node state from XP ─────────────────────────────── */

function deriveNodes(playerXp: number): RoadNode[] {
  return RAW_NODES.map((node, i, arr) => {
    const unlocked = node.xp <= playerXp;
    const nextNode = arr[i + 1];
    const current = unlocked && (!nextNode || nextNode.xp > playerXp);
    return { ...node, unlocked, current };
  });
}

/* ── Trophy Node ────────────────────────────────────────────── */

function TrophyNode({ node, ownedSlugs, claimedChestIds, onClaimed, onChestClaimed }: {
  node: RoadNode;
  ownedSlugs: Set<string>;
  claimedChestIds: Set<number>;
  onClaimed: () => void;
  onChestClaimed: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [busy, setBusy] = useState(false);

  const archetype = node.archetype ? ARCHETYPES[node.archetype] : null;

  const isMonster = node.type === "monster" && !!node.archetype;
  const requiredSlugs = node.archetype ? getEcliptarsByArchetype(node.archetype).map(e => e.slug) : [];
  const allOwned = requiredSlugs.length > 0 && requiredSlugs.every(s => ownedSlugs.has(s));
  const showClaim = isMonster && node.unlocked && !allOwned;

  const finalSlug = node.type === "final" ? node.finalMonster ?? null : null;
  const finalOwned = finalSlug ? ownedSlugs.has(finalSlug) : false;
  const showFinalClaim = node.type === "final" && node.unlocked && !!finalSlug && !finalOwned;

  const isChest = node.type === "chest";
  const chestClaimed = isChest && claimedChestIds.has(node.id);
  const showChestOpen = isChest && node.unlocked && !chestClaimed;

  const handleClaim = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!node.archetype || busy) return;
    setBusy(true);
    const granted = await claimArchetypeReward(node.archetype, node.id);
    setBusy(false);
    if (granted.length > 0) {
      toast(`${ARCHETYPES[node.archetype].name} Ecliptars unlocked`, {
        description: `You now own ${granted.map(g => g.name).join(" & ")} for battle.`,
        duration: 6000,
        action: { label: "View in Profile", onClick: () => { window.location.href = "/profile"; } },
      });
      onClaimed();
    }
  };

  const handleClaimFinal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!finalSlug || busy) return;
    setBusy(true);
    const granted = await claimEcliptarBySlug(finalSlug, node.id);
    setBusy(false);
    if (granted) {
      toast(`${granted.name} unlocked`, {
        description: `Equip ${granted.name} in your profile to wield the God archetype.`,
        duration: 6000,
        action: { label: "View in Profile", onClick: () => { window.location.href = "/profile"; } },
      });
      onClaimed();
    }
  };

  const handleOpenChest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isChest || busy) return;
    setBusy(true);
    const bonus = await claimChest(node.id, node.label);
    setBusy(false);
    if (bonus > 0) {
      toast(`${node.label} opened`, { description: `+${bonus} bonus XP added to your total.`, duration: 6000 });
      onChestClaimed();
    } else {
      toast("Couldn't open chest", { description: "It may already be claimed." });
    }
  };

  const getIcon = () => {
    if (node.type === "final") {
      const I = node.finalMonster === "newton" ? Apple : Atom;
      return <I size={24} />;
    }
    if (node.type === "rank")  { const I = TIER_ICONS[node.tier]; return <I size={18} />; }
    if (node.type === "chest") return <Gift size={18} />;
    if (node.type === "boss")  return <Skull size={18} />;
    if (archetype)             { const I = archetype.icon; return <I size={18} />; }
    return <Star size={16} />;
  };

  const classes = cn(
    "tr-node",
    `tr-node--${node.type}`,
    node.unlocked && "tr-node--unlocked",
    node.current && "tr-node--current",
    !node.unlocked && "tr-node--locked",
  );

  return (
    <motion.div
      className={classes}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="tr-node-xp">{node.xp.toLocaleString()} XP</span>

      <div className="tr-node-glyph">
        {!node.unlocked ? (
          <span className="tr-node-lock"><Lock size={14} /></span>
        ) : getIcon()}

        {node.unlocked && !node.current && (
          <span className="tr-node-check"><CheckCircle size={10} /></span>
        )}
      </div>

      <span className="tr-node-label">{node.label}</span>

      {showClaim && (
        <button className="tr-node-act" onClick={handleClaim} disabled={busy}>
          {busy ? "···" : "Claim"}
        </button>
      )}
      {isMonster && allOwned && <span className="tr-node-status">Claimed</span>}

      {showFinalClaim && (
        <button className="tr-node-act" onClick={handleClaimFinal} disabled={busy}>
          {busy ? "···" : "Claim"}
        </button>
      )}
      {node.type === "final" && finalSlug && finalOwned && <span className="tr-node-status">Claimed</span>}

      {showChestOpen && (
        <button className="tr-node-act" onClick={handleOpenChest} disabled={busy}
          title={`+${CHEST_BONUS_XP[node.label] ?? 0} bonus XP`}>
          {busy ? "···" : "Open"}
        </button>
      )}
      {isChest && chestClaimed && <span className="tr-node-status">Opened</span>}

      <AnimatePresence>
        {hovered && archetype && (
          <motion.div
            className="tr-tooltip"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
          >
            <div className="tr-tooltip-head">
              <archetype.icon size={18} style={{ color: "var(--tc)" }} />
              <div>
                <div className="tr-tooltip-name">{archetype.name}</div>
                {archetype.special && <div className="tr-tooltip-special">{archetype.special}</div>}
              </div>
            </div>
            <div className="tr-tooltip-stats">
              {Object.entries(archetype.stats).map(([k, v]) => (
                <div key={k} className="tr-tooltip-stat">
                  <div className="tr-tooltip-stat-key">{k.slice(0, 3)}</div>
                  <div className="tr-tooltip-stat-val">{v}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Cinema Road (unified single scroll) ──────────────────── */

function CinemaRoad({ allNodes, ownedSlugs, claimedChestIds, onClaimed, onChestClaimed }: {
  allNodes: RoadNode[];
  ownedSlugs: Set<string>;
  claimedChestIds: Set<number>;
  onClaimed: () => void;
  onChestClaimed: () => void;
}) {
  const cinemaRef   = useRef<HTMLDivElement>(null);
  const stageRef    = useRef<HTMLDivElement>(null);
  const roadRef     = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const bigNameRef  = useRef<HTMLDivElement>(null);
  const bigSubRef   = useRef<HTMLDivElement>(null);
  const infoTitleRef = useRef<HTMLDivElement>(null);
  const infoDescRef  = useRef<HTMLDivElement>(null);
  const barTierRef   = useRef<HTMLSpanElement>(null);

  const targetXRef   = useRef(0);
  const smoothXRef   = useRef(0);
  const maxXRef      = useRef(0);
  const lastTierRef  = useRef<TierId | null>(null);
  const tierOffsetsRef = useRef<Array<{ tier: TierId; left: number }>>([]);

  const totalCleared = allNodes.filter(n => n.unlocked).length;

  // Flat road: [divider(bronze), ...bronze nodes, divider(silver), ...]
  const roadItems = useMemo(() => {
    type Item = { type: "divider"; tier: TierId } | { type: "node"; node: RoadNode };
    const items: Item[] = [];
    TIER_ORDER.forEach(tierId => {
      items.push({ type: "divider", tier: tierId });
      allNodes.filter(n => n.tier === tierId).forEach(n => items.push({ type: "node", node: n }));
    });
    return items;
  }, [allNodes]);

  // Update overlay text and aurora color — called from RAF, no setState
  const updateTierUI = useCallback((tierId: TierId) => {
    if (tierId === lastTierRef.current) return;
    lastTierRef.current = tierId;
    const tier = TIERS[tierId];
    cinemaRef.current?.style.setProperty("--cinema-tc", `var(--tr-${tierId})`);
    if (bigNameRef.current)   bigNameRef.current.textContent  = tier.name;
    if (bigSubRef.current)    bigSubRef.current.textContent   = tier.label;
    if (infoTitleRef.current) infoTitleRef.current.textContent = tier.label;
    if (infoDescRef.current)  infoDescRef.current.textContent  = tier.description;
    if (barTierRef.current)   barTierRef.current.textContent   = tier.name;
  }, []);

  // Capture tier divider offsets after first paint
  useEffect(() => {
    const road = roadRef.current;
    const stage = stageRef.current;
    if (!road || !stage) return;

    const dividers = road.querySelectorAll<HTMLElement>("[data-tier-start]");
    tierOffsetsRef.current = Array.from(dividers).map(d => ({
      tier: d.dataset.tierStart as TierId,
      left: d.offsetLeft,
    }));
    maxXRef.current = Math.max(0, road.scrollWidth - stage.clientWidth);

    // Jump to current node on mount
    const currentEl = road.querySelector<HTMLElement>("[data-current='true']");
    if (currentEl) {
      const x = Math.max(0, currentEl.offsetLeft - stage.clientWidth / 2 + currentEl.offsetWidth / 2);
      targetXRef.current = x;
      smoothXRef.current = x;
    }
  }, [allNodes]);

  // RAF: lerp + UI update
  useEffect(() => {
    const road  = roadRef.current;
    const stage = stageRef.current;
    if (!road || !stage) return;
    let rafId: number;

    const tick = () => {
      maxXRef.current = Math.max(0, road.scrollWidth - stage.clientWidth);
      targetXRef.current = Math.max(0, Math.min(maxXRef.current, targetXRef.current));

      const diff = targetXRef.current - smoothXRef.current;
      smoothXRef.current += diff * 0.10;
      if (Math.abs(diff) < 0.3) smoothXRef.current = targetXRef.current;

      road.style.transform = `translate3d(${-(smoothXRef.current).toFixed(2)}px, 0, 0)`;

      // Progress bar
      const pct = maxXRef.current > 0 ? (smoothXRef.current / maxXRef.current) * 100 : 0;
      if (progressRef.current) progressRef.current.style.width = `${pct.toFixed(1)}%`;

      // Current tier
      const center = smoothXRef.current + stage.clientWidth / 2;
      const offsets = tierOffsetsRef.current;
      if (offsets.length > 0) {
        let cur: TierId = offsets[0].tier;
        for (const o of offsets) { if (o.left <= center) cur = o.tier; }
        updateTierUI(cur);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [updateTierUI]);

  // Wheel: vertical delta → horizontal targetX
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const at  = targetXRef.current;
      const max = maxXRef.current;
      if ((delta > 0 && at < max) || (delta < 0 && at > 0)) {
        e.preventDefault();
        targetXRef.current = Math.max(0, Math.min(max, at + delta * 1.4));
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  // Pointer drag
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let active = false, hasMoved = false, startX = 0, startTarget = 0;

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      active = true; hasMoved = false;
      startX = e.clientX; startTarget = targetXRef.current;
      stage.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!active) return;
      const delta = startX - e.clientX;
      if (!hasMoved && Math.abs(delta) > 4) {
        hasMoved = true;
        stage.classList.add("is-dragging");
      }
      if (hasMoved) targetXRef.current = Math.max(0, Math.min(maxXRef.current, startTarget + delta));
    };
    const up = (e: PointerEvent) => {
      if (!active) return;
      active = false; hasMoved = false;
      stage.classList.remove("is-dragging");
      stage.releasePointerCapture(e.pointerId);
    };

    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    return () => {
      stage.removeEventListener("pointerdown", down);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
      stage.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div className="tr-cinema" ref={cinemaRef}>
      <div className="tr-cinema-bg" />

      {/* Top bar */}
      <div className="tr-cinema-bar">
        <div className="tr-cinema-bar-left">
          <span className="tr-cinema-bar-eyebrow">The Ascent</span>
          <span className="tr-cinema-bar-stops">
            <strong ref={barTierRef}>Bronze</strong>
            &nbsp;·&nbsp;{totalCleared} of {allNodes.length} cleared
          </span>
        </div>

        <div className="tr-cinema-progress-wrap">
          <div className="tr-cinema-progress" ref={progressRef} />
          {TIER_ORDER.slice(1).map(id => {
            const xpMax = TIERS.god.xpRequired + 50000; // include final bosses
            const pct   = (TIERS[id].xpRequired / xpMax) * 100;
            return (
              <div
                key={id}
                className="tr-cinema-progress-tick"
                style={{ left: `${pct.toFixed(1)}%`, "--tt-c": `var(--tr-${id})` } as React.CSSProperties}
                title={TIERS[id].name}
              />
            );
          })}
        </div>

        <span className="tr-cinema-hint">← drag · scroll →</span>
      </div>

      {/* Scrollable stage */}
      <div className="tr-cinema-stage" ref={stageRef}>
        {/* Pinned overlay — updated via refs, no re-render */}
        <div className="tr-cinema-overlay" aria-hidden>
          <div className="tr-cinema-bigname" ref={bigNameRef}>Bronze</div>
          <div className="tr-cinema-bigname-sub" ref={bigSubRef}>Origin</div>
          <div className="tr-cinema-info">
            <div className="tr-cinema-info-eyebrow">now entering</div>
            <div className="tr-cinema-info-title" ref={infoTitleRef}>Origin</div>
            <div className="tr-cinema-info-desc" ref={infoDescRef}>
              Where every ascent begins. Foundations of form, focus, and pace.
            </div>
          </div>
        </div>

        {/* The road */}
        <div className="tr-cinema-road" ref={roadRef}>
          {roadItems.map((item, idx) => {
            if (item.type === "divider") {
              const t = TIERS[item.tier];
              return (
                <div
                  key={`div-${item.tier}`}
                  className={`tr-cinema-divider tr-tier--${item.tier}`}
                  data-tier-start={item.tier}
                >
                  <div className="tr-cinema-divider-num">
                    {String(TIER_ORDER.indexOf(item.tier) + 1).padStart(2, "0")}
                  </div>
                  <div className="tr-cinema-divider-name">{t.name}</div>
                  <div className="tr-cinema-divider-sub">{t.label}</div>
                  {t.xpRequired > 0 && (
                    <div className="tr-cinema-divider-xp">{t.xpRequired.toLocaleString()} XP</div>
                  )}
                </div>
              );
            }

            const { node } = item;
            return (
              <div
                key={node.id}
                className={`tr-cinema-node tr-tier--${node.tier}`}
                data-current={node.current ? "true" : undefined}
              >
                <TrophyNode
                  node={node}
                  ownedSlugs={ownedSlugs}
                  claimedChestIds={claimedChestIds}
                  onClaimed={onClaimed}
                  onChestClaimed={onChestClaimed}
                />
              </div>
            );
          })}

          <div className="tr-cinema-endcap">
            <div className="tr-cinema-endcap-dot" />
            <span>Apotheosis</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Overview ──────────────────────────────────────────────── */

function Overview({ playerXp }: { playerXp: number }) {
  const tiers = TIER_ORDER.map(id => TIERS[id]);
  const currentTier = [...tiers].reverse().find(t => playerXp >= t.xpRequired) ?? TIERS.bronze;
  const nextTier = tiers.find(t => t.xpRequired > playerXp);
  const pct = nextTier
    ? Math.max(0, Math.min(100, ((playerXp - currentTier.xpRequired) / (nextTier.xpRequired - currentTier.xpRequired)) * 100))
    : 100;

  return (
    <motion.div
      className={`tr-overview tr-tier--${currentTier.id}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="tr-ov-left">
        <div className="tr-ov-eyebrow">Current Rank</div>
        <div className="tr-ov-tier-name">{currentTier.name}</div>
        <div className="tr-ov-tier-label">{currentTier.label}</div>
      </div>

      <div className="tr-ov-right">
        <div className="tr-ov-bar-head">
          <div>
            <span className="tr-ov-xp">{playerXp.toLocaleString()}</span>
            <span className="tr-ov-xp-lbl">XP TOTAL</span>
          </div>
          <div className="tr-ov-next">
            {nextTier ? <>Next — <strong>{nextTier.name}</strong> · {(nextTier.xpRequired - playerXp).toLocaleString()} XP to go</> : <strong>Apotheosis reached</strong>}
          </div>
        </div>

        <div className="tr-ov-bar-wrap">
          <motion.div
            className="tr-ov-bar"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: pct / 100 }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          />
          <div className="tr-ov-shimmer" />
        </div>

        <div className="tr-ov-pips">
          {tiers.map((t) => {
            const done = playerXp >= t.xpRequired;
            return (
              <div
                key={t.id}
                className={`tr-ov-pip ${done ? "tr-ov-pip--done" : ""}`}
                style={done ? ({ "--pip-tc": `var(--tr-${t.id})` } as React.CSSProperties) : undefined}
              />
            );
          })}
        </div>
        <div className="tr-ov-pip-lbl">
          {tiers.map(t => (
            <span
              key={t.id}
              className={cn(
                t.id === currentTier.id && "is-current",
                playerXp >= t.xpRequired && t.id !== currentTier.id && "is-done",
              )}
            >
              {t.name.slice(0, 3)}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Final monsters ───────────────────────────────────────── */

function FinalMonsters() {
  return (
    <div className="tr-final-wrap">
      <div className="tr-section-head" style={{ position: "relative" }}>
        <div className="tr-section-eyebrow">End of the Road</div>
        <div className="tr-section-title">The <em>final two</em></div>
      </div>
      <div className="tr-final-grid">
        <motion.div
          className="tr-final-card tr-final-card--newton"
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="tr-final-head">
            <div className="tr-final-glyph"><Apple size={28} /></div>
            <div>
              <div className="tr-final-name">Newton</div>
              <div className="tr-final-sub">Divine · Cosmic Being</div>
            </div>
          </div>
          <p className="tr-final-desc">
            A divine, cosmic being holding an apple. Embodies gravity, intelligence, space, and ultimate knowledge.
          </p>
          <div className="tr-final-pills">
            <span className="tr-final-pill">48,000 XP</span>
            <span className="tr-final-pill">Legendary</span>
          </div>
        </motion.div>

        <motion.div
          className="tr-final-card tr-final-card--ecliptadon"
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="tr-final-head">
            <div className="tr-final-glyph"><Atom size={28} /></div>
            <div>
              <div className="tr-final-name">Ecliptadon</div>
              <div className="tr-final-sub">Celestial · Ancient Power</div>
            </div>
          </div>
          <p className="tr-final-desc">
            A massive celestial dinosaur in radiant armor. Ancient power, cosmic destruction incarnate.
          </p>
          <div className="tr-final-pills">
            <span className="tr-final-pill">50,000 XP</span>
            <span className="tr-final-pill">Mythical</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Archetype legend ──────────────────────────────────────── */

function ArchetypeLegend() {
  return (
    <div className="tr-legend">
      <div className="tr-section-head">
        <div className="tr-section-eyebrow">Reference</div>
        <div className="tr-section-title">Ecliptar <em>archetypes</em></div>
      </div>
      <div className="tr-legend-grid">
        {Object.values(ARCHETYPES).map((a) => (
          <motion.div
            key={a.id}
            className={`tr-arc tr-arc--${a.id}`}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="tr-arc-head">
              <span className="tr-arc-icon"><a.icon size={16} /></span>
              <span className="tr-arc-name">{a.name}</span>
            </div>
            <div className="tr-arc-stats">
              {Object.entries(a.stats).map(([k, v]) => (
                <div key={k}>
                  <div className="tr-arc-stat-key">{k.slice(0, 3)}</div>
                  <div className="tr-arc-stat-val">{v}</div>
                </div>
              ))}
            </div>
            {a.special && <div className="tr-arc-special">✦ {a.special}</div>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ── Main ──────────────────────────────────────────────────── */

export function TrophyRoad({ compact = false }: { compact?: boolean }) {
  const { xp: playerXp } = usePlayerXp();
  const { slugs: ownedSlugs, refresh: refreshOwned } = useOwnedEcliptars();
  const [claimedChestIds, setClaimedChestIds] = useState<Set<number>>(new Set());
  const refreshChests = async () => setClaimedChestIds(await fetchClaimedChestNodeIds());
  useEffect(() => { void refreshChests(); }, []);

  const allNodes = useMemo(() => deriveNodes(playerXp), [playerXp]);

  if (compact) {
    const previewNodes = allNodes.slice(0, 14);
    const currentTier = [...TIER_ORDER].reverse().map(id => TIERS[id]).find(t => playerXp >= t.xpRequired) ?? TIERS.bronze;
    return (
      <section className="tr-shell tr-compact">
        <div className="tr-compact-inner">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="tr-compact-title">Your trophy <em>road</em></h2>
            <p className="tr-compact-desc">
              Rise from Bronze to God Tier through eight chapters. Each tier hides rank promotions,
              archetype unlocks, reward chests, and boss encounters.
            </p>
            <div className="tr-compact-tiers">
              {TIER_ORDER.slice(0, 4).map(id => {
                const t = TIERS[id];
                return (
                  <div
                    key={id}
                    className="tr-compact-tier-row"
                    style={{ "--ct": `var(--tr-${id})` } as React.CSSProperties}
                  >
                    <span className="tr-compact-dot" />
                    <strong>{t.name}</strong>
                    <span>{t.description}</span>
                  </div>
                );
              })}
              <p className="tr-compact-tier-row" style={{ color: "var(--tr-fog)", marginLeft: 20 }}>
                <em>· and four more legendary tiers</em>
              </p>
            </div>
          </motion.div>

          <motion.div
            className="tr-compact-preview"
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="tr-compact-preview-track">
              {previewNodes.map((n, i) => {
                const Icon = n.type === "rank" ? TIER_ICONS[n.tier]
                  : n.type === "chest" ? Gift
                  : n.type === "boss" ? Skull
                  : n.archetype ? ARCHETYPES[n.archetype].icon
                  : Star;
                return (
                  <React.Fragment key={n.id}>
                    <div
                      className={cn("tr-compact-preview-node", !n.unlocked && "tr-compact-preview-node--locked")}
                      style={{ "--ct": `var(--tr-${n.tier})` } as React.CSSProperties}
                      title={n.label}
                    >
                      {n.unlocked ? <Icon size={13} /> : <Lock size={11} />}
                    </div>
                    {i < previewNodes.length - 1 && (
                      <div
                        className="tr-compact-preview-line"
                        style={{ "--ct": `var(--tr-${n.tier})` } as React.CSSProperties}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="tr-compact-preview-foot">
              <div>
                <div className="tr-compact-preview-foot-lbl">Current rank</div>
                <div
                  className="tr-compact-preview-foot-val"
                  style={{ color: `var(--tr-${currentTier.id})` }}
                >
                  {currentTier.name}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="tr-compact-preview-foot-lbl">Total XP</div>
                <div className="tr-compact-preview-foot-val">{playerXp.toLocaleString()}</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    );
  }

  // Full version
  return (
    <div className="tr-shell">
      <Overview playerXp={playerXp} />

      <CinemaRoad
        allNodes={allNodes}
        ownedSlugs={ownedSlugs}
        claimedChestIds={claimedChestIds}
        onClaimed={refreshOwned}
        onChestClaimed={() => { void refreshChests(); }}
      />

      <FinalMonsters />
      <ArchetypeLegend />

      <div style={{ marginTop: 48, padding: "20px 26px", borderRadius: 12, border: "1px solid var(--tr-line)", background: "var(--tr-bg-panel)", backdropFilter: "blur(14px)", display: "flex", alignItems: "center", gap: 14 }}>
        <Sparkles size={16} style={{ color: "var(--tr-unreal)" }} />
        <span style={{ fontFamily: "var(--tr-serif)", fontStyle: "italic", fontSize: 14, color: "var(--tr-ink-dim)" }}>
          Earn XP through battles, lessons, and tests. Every stop on the road is a question worth asking yourself.
        </span>
      </div>
    </div>
  );
}
