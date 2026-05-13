import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { User, Trophy, Flame, Sparkles, MessageSquare, Loader2, Zap, Calendar, UserPlus, UserCheck, Swords } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { ECLIPTARS } from "@/lib/ecliptars";
import { ARCHETYPES } from "@/components/battles/archetypes";
import { cn } from "@/lib/utils";
import type { MonsterArchetypeKey } from "@/lib/trophy-road-data";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ARCHETYPES } from "@/components/battles/archetypes";
import type { ArchetypeId } from "@/components/battles/types";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.username} – Eclipta Profile` },
      { name: "description", content: `Public profile of ${params.username} on Eclipta.` },
    ],
  }),
  component: PublicProfilePage,
});

type PublicProfile = {
  user_id: string;
  username: string;
  xp: number;
  current_streak: number;
  best_streak: number;
  equipped_ecliptar: string | null;
  avatar_url: string | null;
  created_at: string;
};

type Ecliptar = { id: string; ecliptar_name: string; ecliptar_slug: string; archetype: string };
type Thread = { id: string; title: string; created_at: string; votes: number; answer_count: number };

function PublicProfilePage() {
  const { username } = useParams({ from: "/u/$username" });
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [ecliptars, setEcliptars] = useState<Ecliptar[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [challengeArch, setChallengeArch] = useState<ArchetypeId>("speedster");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Use the SECURITY DEFINER RPC so only the 8 safe public fields are
      // returned regardless of who is calling (anon or authenticated).
      // Direct user_profiles SELECT is now restricted to own row only.
      const { data: rows } = await supabase
        .rpc("get_public_profile" as any, { p_username: username });
      const p = Array.isArray(rows) ? rows[0] ?? null : rows ?? null;
      if (!p) { setNotFound(true); setLoading(false); return; }
      setProfile(p as PublicProfile);

      const [{ data: e }, { data: t }, { count: fCount }, followRow] = await Promise.all([
        supabase.from("user_ecliptars").select("id,ecliptar_name,ecliptar_slug,archetype").eq("user_id", p.user_id),
        supabase.from("forum_threads").select("id,title,created_at,votes,answer_count").eq("user_id", p.user_id).order("created_at", { ascending: false }).limit(10),
        supabase.from("user_follows").select("id", { count: "exact", head: true }).eq("following_id", p.user_id),
        user
          ? supabase.from("user_follows").select("id").eq("follower_id", user.id).eq("following_id", p.user_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setEcliptars((e as Ecliptar[]) || []);
      setThreads((t as Thread[]) || []);
      setFollowerCount(fCount ?? 0);
      setIsFollowing(!!followRow?.data);
      setLoading(false);
    })();
  }, [username, user]);

  const toggleFollow = async () => {
    if (!user || !profile || followBusy) return;
    if (user.id === profile.user_id) return;
    setFollowBusy(true);
    try {
      if (isFollowing) {
        const { error } = await supabase.from("user_follows")
          .delete().eq("follower_id", user.id).eq("following_id", profile.user_id);
        if (error) throw error;
        setIsFollowing(false);
        setFollowerCount((c) => Math.max(0, c - 1));
      } else {
        const { error } = await supabase.from("user_follows")
          .insert({ follower_id: user.id, following_id: profile.user_id });
        if (error) throw error;
        setIsFollowing(true);
        setFollowerCount((c) => c + 1);
        toast.success(`Following ${profile.username}`);
      }
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Couldn't update follow.");
    } finally {
      setFollowBusy(false);
    }
  };

  const sendChallenge = async () => {
    if (!user || !profile || challengeBusy) return;
    if (user.id === profile.user_id) return;
    setChallengeBusy(true);
    try {
      const { error } = await supabase.rpc("create_pvp_challenge" as any, {
        p_challenged_id: profile.user_id,
        p_archetype: challengeArch,
      });
      if (error) throw error;
      toast.success(`Challenge sent to ${profile.username}`);
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Couldn't send challenge.");
    } finally {
      setChallengeBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background"><Navbar />
        <div className="flex justify-center pt-32"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-background"><Navbar />
        <div className="text-center pt-32 px-6">
          <h1 className="font-display text-3xl font-bold mb-2">User not found</h1>
          <p className="text-muted-foreground mb-6">No learner with the username "{username}".</p>
          <Link to="/forum" className="text-neon-purple hover:underline text-sm font-bold tracking-widest">← BACK TO FORUM</Link>
        </div>
      </div>
    );
  }

  const equipped = profile.equipped_ecliptar
    ? ECLIPTARS.find((e) => e.slug === profile.equipped_ecliptar)
    : null;
  const equippedArch = equipped ? ARCHETYPES[equipped.archetype as MonsterArchetypeKey] : null;
  const EquippedIcon = equipped?.icon ?? User;

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <section className="pt-24 pb-16 max-w-4xl mx-auto px-6">
        <motion.div
          className="glass-panel p-8 mb-6 flex flex-col sm:flex-row items-center sm:items-start gap-6"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        >
          <div className={cn(
            "w-24 h-24 rounded-full border-2 flex items-center justify-center shrink-0 overflow-hidden",
            equippedArch ? equippedArch.borderColor + " bg-secondary/30" : "border-neon-purple/40 bg-neon-purple/10"
          )}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
            ) : (
              <EquippedIcon className={cn("w-12 h-12", equippedArch?.color ?? "text-neon-purple")} />
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-4xl font-bold font-display tracking-tight">{profile.username}</h1>
            <p className="text-xs text-muted-foreground tracking-widest font-bold uppercase mt-1 flex items-center gap-1.5 justify-center sm:justify-start">
              <Calendar className="w-3 h-3" />
              Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
            </p>
            <div className="flex flex-wrap gap-4 mt-4 justify-center sm:justify-start">
              <Stat icon={<Zap className="w-3.5 h-3.5" />} label="XP" value={profile.xp} color="text-neon-purple" />
              <Stat icon={<Flame className="w-3.5 h-3.5" />} label="Streak" value={profile.current_streak} color="text-neon-pink" />
              <Stat icon={<Trophy className="w-3.5 h-3.5" />} label="Best" value={profile.best_streak} color="text-neon-cyan" />
              <Stat icon={<Sparkles className="w-3.5 h-3.5" />} label="Ecliptars" value={ecliptars.length} color="text-foreground" />
              <Stat icon={<UserCheck className="w-3.5 h-3.5" />} label="Followers" value={followerCount} color="text-foreground" />
            </div>
            {user && user.id !== profile.user_id && (
              <div className="mt-4 flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                <button
                  onClick={toggleFollow}
                  disabled={followBusy}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-widest uppercase border transition-colors disabled:opacity-50",
                    isFollowing
                      ? "border-border bg-secondary/40 text-foreground hover:bg-destructive/20 hover:border-destructive/50"
                      : "border-neon-purple/60 bg-neon-purple/10 text-neon-purple hover:bg-neon-purple/20"
                  )}
                >
                  {followBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isFollowing ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  {isFollowing ? "Following" : "Follow"}
                </button>
                <select
                  value={challengeArch}
                  onChange={(e) => setChallengeArch(e.target.value as ArchetypeId)}
                  className="bg-secondary/60 border border-border/60 px-2 py-2 text-[11px] font-bold tracking-widest uppercase"
                  aria-label="Your class for the challenge"
                >
                  {(Object.keys(ARCHETYPES) as ArchetypeId[]).map(id => (
                    <option key={id} value={id}>{ARCHETYPES[id].name}</option>
                  ))}
                </select>
                <button
                  onClick={sendChallenge}
                  disabled={challengeBusy}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-widest uppercase border border-neon-pink/60 bg-neon-pink/10 text-neon-pink hover:bg-neon-pink/20 transition-colors disabled:opacity-50"
                >
                  {challengeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Swords className="w-3.5 h-3.5" />}
                  Challenge
                </button>
              </div>
            )}
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-neon-purple" />
              <h2 className="font-display font-bold text-sm tracking-tight uppercase">Ecliptars Owned</h2>
            </div>
            {ecliptars.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No ecliptars claimed yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {ecliptars.slice(0, 9).map((e) => {
                  const arch = ARCHETYPES[e.archetype as MonsterArchetypeKey];
                  const eclip = ECLIPTARS.find((x) => x.slug === e.ecliptar_slug);
                  const Icon = eclip?.icon ?? Sparkles;
                  return (
                    <div key={e.id} className={cn("glass-panel p-3 border text-center", arch?.borderColor)}>
                      <Icon className={cn("w-6 h-6 mx-auto", arch?.color)} />
                      <p className={cn("text-[10px] mt-1 font-bold tracking-widest", arch?.color)}>{e.ecliptar_name}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-neon-pink" />
              <h2 className="font-display font-bold text-sm tracking-tight uppercase">Recent Threads</h2>
            </div>
            {threads.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No threads posted yet.</p>
            ) : (
              <ul className="space-y-2">
                {threads.map((t) => (
                  <li key={t.id} className="text-xs border-b border-border/50 pb-2">
                    <Link to="/forum/$threadId" params={{ threadId: t.id }} className="font-medium hover:text-neon-pink transition-colors line-clamp-1">
                      {t.title}
                    </Link>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t.votes} votes · {t.answer_count} answers</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", color)}>
      {icon}
      <span className="text-base font-bold font-display tabular-nums">{value.toLocaleString()}</span>
      <span className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">{label}</span>
    </div>
  );
}
