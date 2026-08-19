/**
 * One fighter: their sprite, bars, momentum and the numbers that float off
 * them when they take a hit.
 *
 * The floats are derived from HP changes rather than pushed by the caller, so
 * every damage source - bot, live opponent, wild event, heal - produces one
 * without the arena having to remember to ask.
 *
 * Split out of KnowledgeBattles.tsx.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Shield, Sparkles } from "lucide-react";
import { ARCHETYPES } from "./archetypes";
import { comboThresholdFor } from "@/config/battle-tuning";
import { EffectChips } from "./ArenaOverlays";
import { FocusBar, HpBar } from "./ResourceBars";
import type { ActiveEffect } from "./effects";
import type { ArchetypeId, Fighter } from "./types";

export function FighterCard({
  fighter,
  side,
  momentum,
  archetype,
  showHit,
  showHeal,
  canCharge = false,
  effects = [],
  showHp = true,
}: {
  fighter: Fighter;
  side: "left" | "right";
  momentum: number;
  archetype?: ArchetypeId;
  effects?: ActiveEffect[];
  showHit: boolean;
  showHeal: boolean;
  canCharge?: boolean;
  /** False in modes where health is not the resource - the bar would sit at
   *  full all match and read as a win condition that isn't one. */
  showHp?: boolean;
}) {
  const arch = archetype ? ARCHETYPES[archetype] : null;
  const comboThreshold = comboThresholdFor(archetype);

  // In-battle creature art. Falls back to the Lucide icon if the sprite is
  // missing or fails to load; reset when the fighter's sprite changes.
  const [spriteFailed, setSpriteFailed] = useState(false);
  useEffect(() => {
    setSpriteFailed(false);
  }, [fighter.sprite]);
  const showSprite = !!fighter.sprite && !spriteFailed;

  // Floating combat numbers - derived from HP deltas so every damage source
  // (bot, live PvP, wild events, heals) produces one automatically.
  const prevHpRef = useRef(fighter.hp);
  const floatIdRef = useRef(0);
  const [floats, setFloats] = useState<{ id: number; delta: number }[]>([]);
  useEffect(() => {
    const delta = fighter.hp - prevHpRef.current;
    prevHpRef.current = fighter.hp;
    if (delta === 0) return;
    const id = ++floatIdRef.current;
    setFloats((f) => [...f, { id, delta }]);
    // No cleanup: each float owns its timer, so rapid back-to-back hits
    // don't cancel the previous number's removal.
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1200);
  }, [fighter.hp]);

  return (
    <motion.div
      className={`btt-card ${side === "left" ? "btt-card--cyan" : "btt-card--pink"} p-5 flex-1 relative overflow-hidden`}
      animate={showHit ? { x: side === "left" ? [-8, 8, -4, 0] : [8, -8, 4, 0] } : {}}
      transition={{ duration: 0.4 }}
    >
      <AnimatePresence>
        {showHit && (
          <motion.div
            className="absolute inset-0 bg-neon-pink/10 z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
        {showHeal && (
          <motion.div
            className="absolute inset-0 bg-neon-cyan/10 z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
      <div className="btt-float-layer" aria-hidden>
        <AnimatePresence>
          {floats.map((f) => (
            <motion.span
              key={f.id}
              className={`btt-float absolute ${f.delta < 0 ? "btt-float--dmg" : "btt-float--heal"} ${Math.abs(f.delta) >= 25 ? "btt-float--big" : ""}`}
              initial={{ opacity: 0, y: 14, scale: 0.7 }}
              animate={{ opacity: [0, 1, 1, 0], y: -42, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.15, times: [0, 0.12, 0.72, 1], ease: "easeOut" }}
            >
              {f.delta > 0 ? `+${f.delta}` : f.delta}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="relative z-10">
        {showSprite && (
          <div className="relative flex justify-center mb-3">
            {/* Soft spotlight so the creature always separates from the card,
                whether its art is dark or light. */}
            <div
              aria-hidden
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-40 sm:h-52 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.12),transparent_68%)]"
            />
            <img
              src={fighter.sprite}
              // Decorative: the fighter's name is rendered as text directly
              // below, so alt text here would just be a duplicate announcement.
              alt=""
              aria-hidden="true"
              onError={() => setSpriteFailed(true)}
              // Ecliptar art is drawn facing left, which is right for the
              // opponent on the right-hand card but leaves the player's creature
              // facing away from the fight. Mirroring the left card turns the
              // two to face each other, which is what makes a duel read as a
              // duel rather than two portraits side by side.
              className={`relative h-32 sm:h-44 w-auto max-w-full object-contain select-none pointer-events-none drop-shadow-[0_10px_22px_rgba(0,0,0,0.65)] ${
                side === "left" ? "-scale-x-100" : ""
              }`}
            />
          </div>
        )}
        <div className="flex items-center gap-3 mb-4">
          {!showSprite && (
            <div
              className={`w-11 h-11 border flex items-center justify-center ${side === "left" ? "border-neon-cyan/40 text-neon-cyan" : "border-neon-pink/40 text-neon-pink"}`}
            >
              <fighter.icon className="w-6 h-6" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h4 className="btt-shout text-xl truncate">{fighter.name}</h4>
            {arch && (
              <span
                className={`inline-flex items-center gap-1 text-[9px] font-bold tracking-widest ${arch.color}`}
              >
                <arch.icon className="w-3 h-3" /> {arch.name.toUpperCase()}
              </span>
            )}
            {momentum > 0 &&
              (() => {
                const combos = Math.floor(momentum / comboThreshold);
                const isHot = combos >= 2;
                const isWarm = combos >= 1;
                return (
                  <motion.div
                    className={`flex items-center gap-1 ${isHot ? "text-neon-pink" : isWarm ? "text-neon-pink/75" : "text-neon-pink/50"}`}
                    key={momentum}
                    initial={{ scale: 1.35, opacity: 0.7 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    <Flame className={isHot ? "w-4 h-4" : "w-3 h-3"} />
                    <span
                      className={`font-bold tracking-widest ${isHot ? "text-[11px]" : "text-[10px]"}`}
                    >
                      {momentum}x STREAK
                    </span>
                  </motion.div>
                );
              })()}
          </div>
        </div>
        {showHp && (
          <HpBar
            current={fighter.hp}
            max={fighter.maxHp}
            color={side === "left" ? "bg-neon-cyan" : "bg-neon-pink"}
            label="HP"
          />
        )}
        {/* Absorb pool (Healer passive) - only rendered while it holds charge,
            so classes without a shield never show an empty slot. */}
        <AnimatePresence>
          {(fighter.shield ?? 0) > 0 && (
            <motion.div
              className="mt-1.5 flex items-center gap-1 text-tier-silver"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              key={fighter.shield}
            >
              <Shield className="w-3 h-3" />
              <span className="text-[10px] font-bold tracking-widest tabular-nums">
                {fighter.shield} SHIELD
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-2">
          <FocusBar
            current={fighter.focus}
            max={fighter.maxFocus}
            isPlayer={side === "left"}
            canCharge={canCharge && side === "left"}
          />
        </div>
        <EffectChips effects={effects} side={side} />
      </div>
      <AnimatePresence>
        {momentum > 0 && momentum % comboThreshold === 0 && (
          <motion.div
            className="absolute top-2 right-2 text-neon-pink"
            initial={{ scale: 0, rotate: -30, opacity: 0 }}
            animate={{ scale: [0, 1.5, 1], rotate: [0, 12, -6, 0], opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.45 }}
            key={Math.floor(momentum / comboThreshold)}
          >
            <Sparkles className="w-7 h-7" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
