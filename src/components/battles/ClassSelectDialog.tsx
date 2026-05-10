import { motion } from "framer-motion";
import { Lock, ArrowLeft, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { ARCHETYPES } from "./archetypes";
import type { ArchetypeId } from "./types";
import { getUnlockedArchetypes, ROAD_NODES } from "@/lib/trophy-road-data";
import { cn } from "@/lib/utils";
import { useOwnedEcliptars, usePlayerXp } from "@/hooks/use-player-xp";
import { getEcliptarsByArchetype, getEcliptarBySlug, type Ecliptar } from "@/lib/ecliptars";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useArchetypeMastery } from "@/hooks/use-archetype-mastery";
import { getMasteryRank, getMasteryStats } from "@/lib/archetype-mastery";

function StatPill({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1", dim && "opacity-40")}>
      <span className="text-[9px] font-bold tracking-widest text-muted-foreground w-8 shrink-0">{label}</span>
      <span className="text-[10px] font-bold font-display text-foreground truncate">{value}</span>
    </div>
  );
}

function ArchStatGrid({ arch, isUnlocked }: { arch: import("./types").Archetype; isUnlocked: boolean }) {
  const rnd = arch.statsAreRandom;
  const dmgVal = rnd ? "???" : arch.multiplierScales ? "13→27" : String(arch.baseDamage);
  const multVal = rnd ? "???" : arch.multiplierScales ? "+15→40%" : `+${Math.round(arch.multiplierStep * 100)}%`;
  const healVal = rnd ? "???" : arch.healAmount === null ? "NONE" : String(arch.healAmount);
  const diffVal = rnd ? "???" : `${arch.diffMin}–${arch.diffMax}`;
  const timeVal = rnd ? "???" : `${arch.timeMultiplier}×`;
  const hpVal   = rnd ? "???" : String(arch.maxHp);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
      <StatPill label="HP"   value={hpVal}   dim={!isUnlocked} />
      <StatPill label="DMG"  value={dmgVal}  dim={!isUnlocked} />
      <StatPill label="MULT" value={multVal} dim={!isUnlocked} />
      <StatPill label="HEAL" value={healVal} dim={!isUnlocked} />
      <StatPill label="DIFF" value={diffVal} dim={!isUnlocked} />
      <StatPill label="TIME" value={timeVal} dim={!isUnlocked} />
    </div>
  );
}

export interface ClassSelection {
  archetype: ArchetypeId;
  ecliptar: Ecliptar;
}

export function ClassSelectDialog({ onSelect }: { onSelect: (sel: ClassSelection) => void }) {
  const { xp } = usePlayerXp();
  const { slugs: ownedSlugs } = useOwnedEcliptars();
  const { mastery } = useArchetypeMastery();
  const unlocked = getUnlockedArchetypes(xp);
  const allArchetypes = Object.values(ARCHETYPES);
  const [pickedArch, setPickedArch] = useState<ArchetypeId | null>(null);
  const [equippedSlug, setEquippedSlug] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("equipped_ecliptar")
        .eq("user_id", user.id)
        .maybeSingle();
      setEquippedSlug((data as any)?.equipped_ecliptar ?? null);
    })();
  }, []);

  const equipped = equippedSlug ? getEcliptarBySlug(equippedSlug) : undefined;
  const equippedOwned = equipped ? ownedSlugs.has(equipped.slug) : false;
  const equippedArch = equipped ? ARCHETYPES[equipped.archetype] : undefined;

  // Step 2: Ecliptar select
  if (pickedArch) {
    const arch = ARCHETYPES[pickedArch];
    const ecliptars = getEcliptarsByArchetype(pickedArch);
    const ownedEcliptars = ecliptars.filter((e) => ownedSlugs.has(e.slug));

    return (
      <motion.div
        className="glass-panel p-8"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <button
          onClick={() => setPickedArch(null)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to archetypes
        </button>

        <div className="flex items-center gap-3 mb-6">
          <arch.icon className={cn("w-10 h-10", arch.color)} />
          <div>
            <h3 className="text-xl font-bold font-display">{arch.name}</h3>
            <p className={cn("text-xs font-bold tracking-widest", arch.color)}>CHOOSE YOUR ECLIPTAR</p>
          </div>
        </div>

        {ownedEcliptars.length === 0 ? (
          <div className="text-center py-10">
            <Lock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">No Ecliptars unlocked for this archetype yet.</p>
            <p className="text-xs text-muted-foreground mb-4">
              Visit the Trophy Road and claim the {arch.name} reward to unlock its Ecliptars.
            </p>
            <Link
              to="/progress"
              className="inline-block px-4 py-2 bg-neon-purple text-primary-foreground text-xs font-bold tracking-widest hover:opacity-90 transition-opacity"
            >
              GO TO TROPHY ROAD
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {ecliptars.map((e) => {
              const isOwned = ownedSlugs.has(e.slug);
              return (
                <motion.button
                  key={e.slug}
                  disabled={!isOwned}
                  onClick={() => isOwned && onSelect({ archetype: pickedArch, ecliptar: e })}
                  className={cn(
                    "glass-panel p-5 text-left border transition-colors relative overflow-hidden",
                    isOwned
                      ? `${arch.borderColor} hover:bg-secondary/20 cursor-pointer`
                      : "border-border/30 opacity-50 cursor-not-allowed"
                  )}
                  whileHover={isOwned ? { scale: 1.03, y: -2 } : {}}
                  whileTap={isOwned ? { scale: 0.97 } : {}}
                >
                  {!isOwned && (
                    <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <e.icon className={cn("w-10 h-10 mb-2", isOwned ? arch.color : "text-muted-foreground")} />
                  <h4 className={cn("font-bold font-display text-base", isOwned ? arch.color : "text-muted-foreground")}>
                    {e.name}
                  </h4>
                  <p className="text-[10px] text-muted-foreground tracking-widest mt-0.5">
                    {arch.name.toUpperCase()}
                  </p>
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>
    );
  }

  // Step 1: Archetype select
  return (
    <motion.div
      className="glass-panel p-8"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {equipped && equippedOwned && equippedArch && (
        <button
          onClick={() => onSelect({ archetype: equipped!.archetype, ecliptar: equipped! })}
          className={cn(
            "w-full mb-5 px-4 py-3 border-2 text-left transition-colors flex items-center gap-3 group",
            equippedArch.borderColor,
            "hover:bg-secondary/30"
          )}
        >
          <equipped.icon className={cn("w-8 h-8 shrink-0", equippedArch.color)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-neon-purple">QUICK BATTLE</span>
              <span className="text-[9px] text-muted-foreground">EQUIPPED</span>
            </div>
            <div className="font-display font-bold text-base">
              {equipped.name} <span className={cn("text-xs font-normal", equippedArch.color)}>· {equippedArch.name}</span>
            </div>
          </div>
          <Zap className={cn("w-5 h-5 group-hover:scale-110 transition-transform", equippedArch.color)} />
        </button>
      )}

      <h3 className="text-xl font-bold font-display text-center mb-1">Choose Your Archetype</h3>
      <p className="text-xs text-muted-foreground text-center mb-6">
        Unlock more archetypes by progressing on the Trophy Road.
        <span className="text-neon-purple font-bold ml-1">{unlocked.length}/{allArchetypes.length}</span> unlocked
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {allArchetypes.map((arch) => {
          const isUnlocked = unlocked.includes(arch.id);
          const monsterNode = ROAD_NODES.find(n => n.archetype === arch.id);
          const xpNeeded = monsterNode ? monsterNode.xp : 0;
          const ownedCount = getEcliptarsByArchetype(arch.id).filter(e => ownedSlugs.has(e.slug)).length;

          return (
            <motion.button
              key={arch.id}
              onClick={() => isUnlocked && setPickedArch(arch.id)}
              disabled={!isUnlocked}
              className={cn(
                "glass-panel p-5 text-left border transition-colors group relative overflow-hidden",
                isUnlocked
                  ? `${arch.borderColor} hover:bg-secondary/20 cursor-pointer`
                  : "border-border/30 opacity-50 cursor-not-allowed"
              )}
              whileHover={isUnlocked ? { scale: 1.02, y: -2 } : {}}
              whileTap={isUnlocked ? { scale: 0.98 } : {}}
            >
              {!isUnlocked && (
                <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-1">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {xpNeeded.toLocaleString()} XP
                  </span>
                </div>
              )}

              {isUnlocked && (
                <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest rounded-full bg-secondary/60 text-foreground">
                  {ownedCount}/2 ECLIPTARS
                </div>
              )}

              <div className="flex items-center gap-3 mb-3">
                <arch.icon className={cn("w-8 h-8", isUnlocked ? arch.color : "text-muted-foreground")} />
                <div>
                  <h4 className={cn("font-bold font-display text-sm", isUnlocked ? arch.color : "text-muted-foreground")}>{arch.name}</h4>
                  <p className="text-[10px] text-muted-foreground tracking-widest font-bold">{arch.passive}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{arch.description}</p>
              <ArchStatGrid arch={arch} isUnlocked={isUnlocked} />

              {/* Mastery rank — only for unlocked archetypes with at least one battle */}
              {isUnlocked && (() => {
                const m = mastery[arch.id];
                if (!m || m.battles_played === 0) return null;
                const rank = getMasteryRank(m, arch.id);
                const { winRate } = getMasteryStats(m);
                return (
                  <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between">
                    <span className={cn("text-[9px] font-bold tracking-widest", rank.color)}>
                      {rank.level > 0 ? `${["", "I", "II", "III", "IV", "V"][rank.level]} · ${rank.label}` : "UNRANKED"}
                    </span>
                    <span className="text-[9px] text-muted-foreground tabular-nums">
                      {m.battles_played}B · {winRate}%W
                    </span>
                  </div>
                );
              })()}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
