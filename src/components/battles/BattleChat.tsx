import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Volume2, VolumeX, Lock } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { EmoteMark } from "@/components/emotes/EmoteMark";
import { useOwnedEmotes } from "@/hooks/use-owned-emotes";
import type { OpponentType } from "@/lib/matchmaking";
import type { Phase } from "./types";

/**
 * In-battle expression: six preset phrases and the emotes the player has
 * earned. No free text, so an insult is impossible to compose; nothing here
 * interrupts a turn, and one three-second cooldown covers phrases and emotes
 * together so the two cannot be alternated into a stream.
 *
 * Split out of KnowledgeBattles.tsx.
 */

// Preset-only, sportsmanship-first: a fixed set of positive/neutral worded
// phrases. No free text (toxicity), no emoji (brand: docs/brand-system.md).
// Insults are impossible by construction; communication stays warm, not loud.
const CHAT_PHRASES = [
  "Good luck",
  "Nice!",
  "Close one",
  "Well played",
  "Tough question",
  "GG",
] as const;

export interface ChatItem {
  id: number;
  /** The phrase, or the emote's name when `emoteId` is set. */
  text: string;
  /**
   * Set when this is an emote rather than a phrase. Validated against the
   * roster on arrival, so an unknown id never reaches here - see
   * `isEmoteId` in config/emotes.ts for why that check is the important one.
   */
  emoteId?: string;
  fromPlayer: boolean; // true = local player sent it
  senderName: string;
  ts: number; // Date.now() at creation for TTL removal
}

// One counter for every bubble on screen, sent or received, so two arriving in
// the same millisecond never share a React key.
let _chatIdCounter = 0;

export function BattleChat({
  pvpChannelRef,
  opponentType,
  playerName,
  phase,
  incomingItems,
}: {
  pvpChannelRef: React.MutableRefObject<RealtimeChannel | null>;
  opponentType: OpponentType;
  playerName: string;
  phase: Phase;
  incomingItems: ChatItem[];
}) {
  const [sentItems, setSentItems] = useState<ChatItem[]>([]);
  const { roster } = useOwnedEmotes();
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [tick, setTick] = useState(0);

  // Drive cooldown countdown without excessive re-renders
  useEffect(() => {
    if (tick === 0) return;
    const id = setInterval(() => setTick(Date.now()), 200);
    return () => clearInterval(id);
  }, [tick]);

  // Auto-expire displayed items after 4 s
  const allItems = [...sentItems, ...(muted ? [] : incomingItems)].sort((a, b) => a.ts - b.ts);

  const visibleItems = allItems.filter((item) => Date.now() - item.ts < 4000);

  // Only visible during active battle phases - zero footprint otherwise
  const isActive = phase === "select" || phase === "question" || phase === "animate";
  if (!isActive) return null;

  const now = Date.now();
  const onCooldown = now < cooldownUntil;
  const cooldownSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const send = (text: string, emoteId?: string) => {
    if (onCooldown) return;
    const item: ChatItem = {
      id: ++_chatIdCounter,
      text,
      ...(emoteId ? { emoteId } : {}),
      fromPlayer: true,
      senderName: playerName,
      ts: Date.now(),
    };
    setSentItems((prev) => [...prev, item]);
    // One cooldown for phrases and emotes together. Two separate budgets would
    // just double the amount a player can send in the same three seconds.
    setCooldownUntil(Date.now() + 3000);
    setTick(Date.now()); // kick countdown interval

    if (opponentType === "live" && pvpChannelRef.current) {
      void pvpChannelRef.current.send({
        type: "broadcast",
        event: "chat",
        payload: { text, emote_id: emoteId ?? null, sender_name: playerName },
      });
    }
  };

  return (
    <div className="relative">
      {/* Floating message bubbles - up to 2 visible at once */}
      <div className="absolute bottom-full mb-1 w-full pointer-events-none z-10 space-y-1">
        <AnimatePresence>
          {visibleItems.slice(-2).map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.94 }}
              transition={{ duration: 0.18 }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 border text-[11px] font-bold tracking-wide ${
                item.fromPlayer
                  ? "float-right ml-auto border-neon-purple/50 bg-neon-purple/10 text-neon-purple"
                  : "border-neon-pink/50 bg-neon-pink/10 text-neon-pink"
              }`}
              style={{ float: item.fromPlayer ? "right" : "left", clear: "both" }}
            >
              {!item.fromPlayer && (
                <span className="text-muted-foreground text-[9px] font-normal">
                  {item.senderName}:
                </span>
              )}
              {item.emoteId ? (
                <span className="w-5 h-5 inline-block">
                  <EmoteMark id={item.emoteId} label={item.text} />
                </span>
              ) : (
                item.text
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {/* clearfix */}
        <div style={{ clear: "both" }} />
      </div>

      {/* Toolbar */}
      <div className="btt-card p-2 flex items-center gap-2 flex-wrap">
        {/* Toggle + mute controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowPanel((v) => !v)}
            title="Quick chat"
            aria-label="Quick chat"
            aria-expanded={showPanel}
            className={`p-1.5 border text-[10px] font-bold transition-colors ${
              showPanel
                ? "border-neon-purple/60 text-neon-purple bg-neon-purple/10"
                : "border-border/40 text-muted-foreground hover:border-border"
            } active:scale-[0.97]`}
          >
            <MessageSquare className="w-3 h-3" />
          </button>
          <button
            onClick={() => setMuted((v) => !v)}
            title={muted ? "Unmute opponent" : "Mute opponent"}
            aria-label={muted ? "Unmute opponent" : "Mute opponent"}
            aria-pressed={muted}
            className={`p-1.5 border text-[10px] font-bold transition-colors ${
              muted
                ? "border-neon-pink/60 text-neon-pink bg-neon-pink/10"
                : "border-border/40 text-muted-foreground hover:border-border"
            } active:scale-[0.97]`}
          >
            {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
        </div>

        <AnimatePresence>
          {showPanel && (
            <motion.div
              initial={{ opacity: 0, maxWidth: 0 }}
              animate={{ opacity: 1, maxWidth: 600 }}
              exit={{ opacity: 0, maxWidth: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-1 flex-wrap overflow-hidden"
            >
              {/* Preset phrases */}
              {CHAT_PHRASES.map((phrase) => (
                <button
                  key={phrase}
                  onClick={() => send(phrase)}
                  disabled={onCooldown}
                  className="px-2 py-1 border border-border/40 hover:border-neon-purple/50 text-[10px] font-bold tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
                >
                  {phrase}
                </button>
              ))}

              {/* Earned emotes. Locked ones are shown too, naming the chest
                  that opens them - a reward you cannot see is not one you can
                  work towards. */}
              {roster.length > 0 && <span className="w-px h-5 bg-border/60 mx-0.5" />}
              {roster.map(({ emote, owned, from }) => (
                <button
                  key={emote.id}
                  onClick={() => owned && send(emote.name, emote.id)}
                  disabled={onCooldown || !owned}
                  aria-label={
                    owned
                      ? `${emote.name} - ${emote.meaning}`
                      : `${emote.name}, locked. Opens with ${from?.label ?? "a Trophy Road chest"}.`
                  }
                  title={
                    owned
                      ? `${emote.name} - ${emote.meaning}`
                      : `Locked - opens with ${from?.label ?? "a Trophy Road chest"}`
                  }
                  className={`w-7 h-7 p-1 border transition-colors active:scale-[0.97] disabled:cursor-not-allowed ${
                    owned
                      ? "border-border/40 hover:border-neon-purple/50 text-neon-purple disabled:opacity-40"
                      : "border-border/20 text-muted-foreground/40"
                  }`}
                >
                  {owned ? (
                    <EmoteMark id={emote.id} label={emote.name} />
                  ) : (
                    <Lock className="w-full h-full" aria-hidden="true" />
                  )}
                </button>
              ))}

              {onCooldown && (
                <span className="text-[9px] font-mono text-muted-foreground ml-1 tabular-nums">
                  {cooldownSec}s
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
