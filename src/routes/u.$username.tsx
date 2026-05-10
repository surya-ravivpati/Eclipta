import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { User, Trophy, Flame, Sparkles, MessageSquare, Loader2, Zap, Calendar } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { ECLIPTARS } from "@/lib/ecliptars";
import { ARCHETYPES } from "@/components/battles/archetypes";
import { cn } from "@/lib/utils";
import type { MonsterArchetypeKey } from "@/lib/trophy-road-data";

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
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [ecliptars, setEcliptars] = useState<Ecliptar[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

      const [{ data: e }, { data: t }] = await Promise.all([
        supabase.from("user_ecliptars").select("id,ecliptar_name,ecliptar_slug,archetype").eq("user_id", p.user_id),
        supabase.from("forum_threads").select("id,title,created_at,votes,answer_count").eq("user_id", p.user_id).order("created_at", { ascending: false }).limit(10),
      ]);
      setEcliptars((e as Ecliptar[]) || []);
      setThreads((t as Thread[]) || []);
      setLoading(false);
    })();
  }, [username]);

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
            </div>
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
