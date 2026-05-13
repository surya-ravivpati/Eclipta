import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Swords, Loader2, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ARCHETYPES } from "./archetypes";
import type { ArchetypeId } from "./types";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

type Result = {
  user_id: string;
  username: string;
  xp: number | null;
  equipped_ecliptar: string | null;
  avatar_url: string | null;
};

const ARCHETYPE_IDS: ArchetypeId[] = [
  "speedster", "tank", "chud", "gambler", "healer", "fulcrum", "accelerator", "god",
];

export function UserSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [archetype, setArchetype] = useState<ArchetypeId>("speedster");
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); return; }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_users" as any, {
        p_query: query.trim(),
        p_limit: 12,
      });
      if (error) { setResults([]); setLoading(false); return; }
      setResults((data as Result[] | null)?.filter((r) => r.user_id !== user?.id) ?? []);
      setLoading(false);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, user?.id]);

  const challenge = async (target: Result) => {
    if (!user) { toast.error("Sign in to challenge."); return; }
    setBusyId(target.user_id);
    try {
      const { error } = await supabase.rpc("create_pvp_challenge" as any, {
        p_challenged_id: target.user_id,
        p_archetype: archetype,
      });
      if (error) throw error;
      toast.success(`Challenge sent to ${target.username}`);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Couldn't send challenge.");
    } finally {
      setBusyId(null);
    }
  };

  const archetypes = useMemo(() => ARCHETYPE_IDS.map(id => ({ id, name: ARCHETYPES[id].name })), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Search className="w-4 h-4 text-neon-cyan" /> Find a player
          </DialogTitle>
          <DialogDescription>Search by username, then send a direct Knowledge Battle challenge.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="username…"
            className="w-full bg-secondary/40 border border-border/60 px-3 py-2 text-sm focus:outline-none focus:border-neon-cyan/60"
          />

          <div className="flex items-center gap-2 text-[10px] tracking-widest font-bold uppercase text-muted-foreground">
            <span>Your class:</span>
            <select
              value={archetype}
              onChange={(e) => setArchetype(e.target.value as ArchetypeId)}
              className="bg-secondary/60 border border-border/60 px-2 py-1 text-xs"
            >
              {archetypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div className="max-h-72 overflow-y-auto -mx-2 px-2">
            {loading && <p className="text-xs text-muted-foreground italic px-2 py-3">Searching…</p>}
            {!loading && query.trim().length >= 2 && results.length === 0 && (
              <p className="text-xs text-muted-foreground italic px-2 py-3">No players match "{query}".</p>
            )}
            {results.map(r => (
              <div key={r.user_id} className="flex items-center gap-3 px-2 py-2 border-b border-border/40 last:border-0">
                <div className="w-9 h-9 rounded-full bg-neon-purple/10 border border-neon-purple/40 flex items-center justify-center overflow-hidden shrink-0">
                  {r.avatar_url
                    ? <img src={r.avatar_url} alt={r.username} className="w-full h-full object-cover" />
                    : <UserIcon className="w-4 h-4 text-neon-purple" />}
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    to="/u/$username"
                    params={{ username: r.username }}
                    onClick={() => onOpenChange(false)}
                    className="text-sm font-bold hover:text-neon-purple truncate block"
                  >
                    {r.username}
                  </Link>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{(r.xp ?? 0).toLocaleString()} XP</p>
                </div>
                <button
                  onClick={() => challenge(r)}
                  disabled={busyId === r.user_id}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold tracking-widest text-neon-pink border border-neon-pink/50 bg-neon-pink/10 hover:bg-neon-pink/20 transition-colors disabled:opacity-50"
                >
                  {busyId === r.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Swords className="w-3 h-3" />}
                  CHALLENGE
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}