import { useEffect, useState, useCallback } from "react";
import { Swords, X, Check, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ARCHETYPES } from "./archetypes";
import type { ArchetypeId } from "./types";
import { toast } from "sonner";

type Challenge = {
  id: string;
  challenger_id: string;
  challenged_id: string;
  challenger_archetype: ArchetypeId;
  status: string;
  created_at: string;
  expires_at: string;
  battle_id: string | null;
};

function dispatchDirectBattle(detail: {
  battleId: string;
  myArchetype: ArchetypeId;
  opponentArchetype: ArchetypeId;
  opponentName: string;
  opponentRating?: number;
  iAmChallenger?: boolean;
}) {
  window.dispatchEvent(new CustomEvent("eclipta:direct-battle", { detail }));
}

export function ChallengeInbox() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<(Challenge & { challenger_username: string | null })[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [defaultArch, setDefaultArch] = useState<ArchetypeId>("speedster");

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("pvp_challenges" as any)
      .select("*")
      .eq("challenged_id", user.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    const rows = (data as Challenge[] | null) ?? [];
    if (rows.length === 0) { setIncoming([]); return; }
    const ids = Array.from(new Set(rows.map(r => r.challenger_id)));
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, username")
      .in("user_id", ids);
    const nameById = new Map((profiles as { user_id: string; username: string | null }[] | null ?? []).map(p => [p.user_id, p.username]));
    setIncoming(rows.map(r => ({ ...r, challenger_username: nameById.get(r.challenger_id) ?? null })));
  }, [user]);

  // Load my equipped archetype to use as default response class
  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("equipped_ecliptar")
        .eq("user_id", user.id)
        .maybeSingle();
      const slug = (data as { equipped_ecliptar: string | null } | null)?.equipped_ecliptar;
      // Use any unlocked default; user can play whatever via the regular flow.
      // Falls back to speedster.
      if (!slug) return;
      // Best-effort archetype guess from slug prefix
      const id = (Object.keys(ARCHETYPES) as ArchetypeId[]).find(k => slug.includes(k));
      if (id) setDefaultArch(id);
    })();
  }, [user]);

  // Initial load + realtime subscription on incoming pvp_challenges
  useEffect(() => {
    if (!user) return;
    void refresh();
    const chan = supabase
      .channel(`challenges-in:${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "pvp_challenges",
        filter: `challenged_id=eq.${user.id}`,
      }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(chan); };
  }, [user, refresh]);

  // Challenger side: when one of MY outgoing challenges is accepted, jump
  // straight into the live battle.
  useEffect(() => {
    if (!user) return;
    const chan = supabase
      .channel(`challenges-out:${user.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "pvp_challenges",
        filter: `challenger_id=eq.${user.id}`,
      }, async (payload) => {
        const row = payload.new as Challenge;
        if (row.status === "accepted" && row.battle_id) {
          // Look up opponent username + their chosen archetype from pvp_battles
          const { data: battle } = await supabase
            .from("pvp_battles" as any)
            .select("opponent_archetype, opponent_id")
            .eq("id", row.battle_id)
            .maybeSingle();
          const oppArch = (battle as { opponent_archetype: ArchetypeId } | null)?.opponent_archetype ?? row.challenger_archetype;
          const oppId = (battle as { opponent_id: string } | null)?.opponent_id;
          let oppName = "Challenger";
          if (oppId) {
            const { data: prof } = await supabase
              .from("user_profiles").select("username").eq("user_id", oppId).maybeSingle();
            oppName = (prof as { username: string | null } | null)?.username ?? oppName;
          }
          toast.success(`${oppName} accepted! Starting battle…`);
          dispatchDirectBattle({
            battleId: row.battle_id,
            myArchetype: row.challenger_archetype,
            opponentArchetype: oppArch,
            opponentName: oppName,
            iAmChallenger: true,
          });
        } else if (row.status === "rejected") {
          toast.error("Challenge declined.");
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(chan); };
  }, [user]);

  const respond = async (c: Challenge & { challenger_username: string | null }, accept: boolean) => {
    setBusy(c.id);
    try {
      const { data, error } = await supabase.rpc("respond_pvp_challenge" as any, {
        p_challenge_id: c.id, p_accept: accept, p_archetype: defaultArch,
      });
      if (error) throw error;
      if (accept && data) {
        const d = data as { battle_id: string };
        dispatchDirectBattle({
          battleId: d.battle_id,
          myArchetype: defaultArch,
          opponentArchetype: c.challenger_archetype,
          opponentName: c.challenger_username ?? "Challenger",
          iAmChallenger: false,
        });
      } else {
        toast.success("Challenge declined.");
      }
      setIncoming(prev => prev.filter(x => x.id !== c.id));
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Couldn't respond to challenge.");
    } finally {
      setBusy(null);
    }
  };

  if (incoming.length === 0) return null;

  return (
    <div className="glass-panel p-4 border-neon-pink/40">
      <div className="flex items-center gap-2 mb-3">
        <Swords className="w-4 h-4 text-neon-pink" />
        <h3 className="text-xs font-bold font-display tracking-widest text-neon-pink">INCOMING CHALLENGES</h3>
      </div>
      <AnimatePresence>
        <div className="space-y-2">
          {incoming.map(c => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-3 px-3 py-2 border border-neon-pink/30 bg-neon-pink/5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{c.challenger_username ?? "Challenger"}</p>
                <p className="text-[10px] text-muted-foreground tracking-widest uppercase">
                  {ARCHETYPES[c.challenger_archetype]?.name ?? c.challenger_archetype} · expires soon
                </p>
              </div>
              <button
                onClick={() => respond(c, true)}
                disabled={busy === c.id}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold tracking-widest text-neon-cyan border border-neon-cyan/50 bg-neon-cyan/10 hover:bg-neon-cyan/20 transition-colors disabled:opacity-50"
              >
                {busy === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} ACCEPT
              </button>
              <button
                onClick={() => respond(c, false)}
                disabled={busy === c.id}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold tracking-widest text-muted-foreground border border-border/60 hover:bg-secondary/50 transition-colors disabled:opacity-50"
              >
                <X className="w-3 h-3" /> DECLINE
              </button>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
}