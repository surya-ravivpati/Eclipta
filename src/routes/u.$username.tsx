import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { User, Trophy, Flame, Sparkles, MessageSquare, Loader2, Zap, Calendar, UserPlus, UserCheck, Users, Activity, Lock } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { ECLIPTARS, getEcliptarsByArchetype } from "@/lib/ecliptars";
import { ARCHETYPES } from "@/components/battles/archetypes";
import { cn } from "@/lib/utils";
import type { MonsterArchetypeKey } from "@/lib/trophy-road-data";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

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
  bio: string | null;
  xp: number;
  current_streak: number;
  best_streak: number;
  equipped_ecliptar: string | null;
  avatar_url: string | null;
  created_at: string;
};

type Ecliptar = { id: string; ecliptar_name: string; ecliptar_slug: string; archetype: string; claimed_at: string };
type Thread = { id: string; title: string; created_at: string; votes: number; answer_count: number };
type AnswerActivity = { id: string; body: string; created_at: string; thread_id: string };

type FeedItem =
  | { kind: "thread"; ts: string; thread: Thread }
  | { kind: "answer"; ts: string; answer: AnswerActivity }
  | { kind: "ecliptar"; ts: string; ecliptar: Ecliptar };

function PublicProfilePage() {
  const { user } = useAuth();
  const { username } = useParams({ from: "/u/$username" });
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [ecliptars, setEcliptars] = useState<Ecliptar[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [answers, setAnswers] = useState<AnswerActivity[]>([]);
  const [followers, setFollowers] = useState<number>(0);
  const [following, setFollowing] = useState<number>(0);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from("user_profiles")
        .select("user_id,username,bio,xp,current_streak,best_streak,equipped_ecliptar,avatar_url,created_at")
        .eq("username", username)
        .maybeSingle();
      if (!p) { setNotFound(true); setLoading(false); return; }
      setProfile(p as PublicProfile);

      const [{ data: e }, { data: t }, { data: a }, fc, fgc, isF] = await Promise.all([
        supabase.from("user_ecliptars").select("id,ecliptar_name,ecliptar_slug,archetype,claimed_at").eq("user_id", p.user_id).order("claimed_at", { ascending: false }),
        supabase.from("forum_threads").select("id,title,created_at,votes,answer_count").eq("user_id", p.user_id).order("created_at", { ascending: false }).limit(20),
        supabase.from("forum_answers").select("id,body,created_at,thread_id").eq("user_id", p.user_id).order("created_at", { ascending: false }).limit(20),
        supabase.from("user_follows").select("id", { count: "exact", head: true }).eq("following_id", p.user_id),
        supabase.from("user_follows").select("id", { count: "exact", head: true }).eq("follower_id", p.user_id),
        user
          ? supabase.from("user_follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id).eq("following_id", p.user_id)
          : Promise.resolve({ count: 0 } as { count: number }),
      ]);
      setEcliptars((e as Ecliptar[]) || []);
      setThreads((t as Thread[]) || []);
      setAnswers((a as AnswerActivity[]) || []);
      setFollowers(fc.count ?? 0);
      setFollowing(fgc.count ?? 0);
      setIsFollowing(((isF as { count?: number }).count ?? 0) > 0);
      setLoading(false);
    })();
  }, [username, user]);

  const isMe = !!user && !!profile && user.id === profile.user_id;

  const toggleFollow = async () => {
    if (!user) return toast.error("Sign in to follow learners");
    if (!profile || isMe) return;
    setFollowBusy(true);
    if (isFollowing) {
      const { error } = await supabase.from("user_follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", profile.user_id);
      setFollowBusy(false);
      if (error) return toast.error(error.message);
      setIsFollowing(false);
      setFollowers((n) => Math.max(0, n - 1));
    } else {
      const { error } = await supabase.from("user_follows")
        .insert({ follower_id: user.id, following_id: profile.user_id });
      setFollowBusy(false);
      if (error) return toast.error(error.message);
      setIsFollowing(true);
      setFollowers((n) => n + 1);
    }
  };

  // Merge thread/answer/ecliptar events into a single chronological feed.
  const feed = useMemo<FeedItem[]>(() => {
    if (!profile) return [];
    const items: FeedItem[] = [
      ...threads.map((t): FeedItem => ({ kind: "thread", ts: t.created_at, thread: t })),
      ...answers.map((a): FeedItem => ({ kind: "answer", ts: a.created_at, answer: a })),
      ...ecliptars.map((e): FeedItem => ({ kind: "ecliptar", ts: e.claimed_at, ecliptar: e })),
    ];
    items.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
    return items.slice(0, 15);
  }, [profile, threads, answers, ecliptars]);

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
  const ownedSlugs = new Set(ecliptars.map((e) => e.ecliptar_slug));
  const archetypeKeys = Object.keys(ARCHETYPES) as MonsterArchetypeKey[];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <section className="pt-24 pb-16 max-w-5xl mx-auto px-6">
        {/* Hero */}
        <motion.div
          className="glass-panel p-8 mb-6"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className={cn(
              "w-28 h-28 rounded-full border-2 flex items-center justify-center shrink-0 overflow-hidden",
              equippedArch ? equippedArch.borderColor + " bg-secondary/30" : "border-neon-purple/40 bg-neon-purple/10"
            )}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
              ) : (
                <EquippedIcon className={cn("w-14 h-14", equippedArch?.color ?? "text-neon-purple")} />
              )}
            </div>
            <div className="flex-1 text-center sm:text-left min-w-0">
              <div className="flex flex-wrap items-center gap-3 justify-center sm:justify-start">
                <h1 className="text-4xl font-bold font-display tracking-tight">{profile.username}</h1>
                {equipped && (
                  <span className={cn(
                    "text-[10px] font-bold tracking-widest border px-2 py-0.5 inline-flex items-center gap-1.5",
                    equippedArch?.borderColor, equippedArch?.color,
                  )}>
                    <EquippedIcon className="w-3 h-3" />
                    {equipped.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground tracking-widest font-bold uppercase mt-1 flex items-center gap-1.5 justify-center sm:justify-start">
                <Calendar className="w-3 h-3" />
                Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
              </p>
              {profile.bio && (
                <p className="text-sm text-foreground/90 mt-3 leading-relaxed whitespace-pre-wrap max-w-xl">
                  {profile.bio}
                </p>
              )}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 justify-center sm:justify-start">
                <Stat icon={<Zap className="w-3.5 h-3.5" />} label="XP" value={profile.xp} color="text-neon-purple" />
                <Stat icon={<Flame className="w-3.5 h-3.5" />} label="Streak" value={profile.current_streak} color="text-neon-pink" />
                <Stat icon={<Trophy className="w-3.5 h-3.5" />} label="Best" value={profile.best_streak} color="text-neon-cyan" />
                <Stat icon={<Sparkles className="w-3.5 h-3.5" />} label="Companions" value={ecliptars.length} color="text-foreground" />
                <Stat icon={<Users className="w-3.5 h-3.5" />} label="Followers" value={followers} color="text-foreground" />
                <Stat icon={<UserCheck className="w-3.5 h-3.5" />} label="Following" value={following} color="text-foreground" />
              </div>
            </div>
            <div className="shrink-0">
              {isMe ? (
                <Link
                  to="/profile"
                  className="px-4 py-2 text-xs font-bold tracking-widest border border-border hover:border-neon-purple text-muted-foreground hover:text-neon-purple transition-colors inline-flex items-center gap-2"
                >EDIT PROFILE</Link>
              ) : (
                <button
                  onClick={toggleFollow}
                  disabled={followBusy || !user}
                  title={!user ? "Sign in to follow" : isFollowing ? "Click to unfollow" : "Follow this learner"}
                  className={cn(
                    "px-4 py-2 text-xs font-bold tracking-widest border transition-colors inline-flex items-center gap-2 disabled:opacity-50",
                    isFollowing
                      ? "border-neon-purple bg-neon-purple/15 text-neon-purple hover:bg-destructive/10 hover:border-destructive hover:text-destructive"
                      : "border-neon-purple bg-neon-purple text-primary-foreground hover:opacity-90",
                  )}
                >
                  {followBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : isFollowing ? <UserCheck className="w-3.5 h-3.5" />
                    : <UserPlus className="w-3.5 h-3.5" />}
                  {isFollowing ? "FOLLOWING" : "FOLLOW"}
                </button>
              )}
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Companions grid (showcased) — 2 cols on desktop */}
          <div className="lg:col-span-2 glass-panel p-6">
            <div className="flex items-end justify-between mb-5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-neon-purple" />
                <h2 className="font-display font-bold text-sm tracking-widest uppercase">Companions</h2>
              </div>
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground">
                {ecliptars.length} / {ECLIPTARS.length} COLLECTED
              </span>
            </div>

            {ecliptars.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No companions claimed yet.</p>
            ) : (
              <div className="space-y-5">
                {archetypeKeys.map((archKey) => {
                  const arch = ARCHETYPES[archKey];
                  const all = getEcliptarsByArchetype(archKey);
                  const ownedHere = all.filter((e) => ownedSlugs.has(e.slug));
                  if (ownedHere.length === 0) return null;
                  return (
                    <div key={archKey}>
                      <div className="flex items-center gap-2 mb-2">
                        <arch.icon className={cn("w-4 h-4", arch.color)} />
                        <h3 className={cn("text-[11px] font-bold font-display tracking-widest uppercase", arch.color)}>{arch.name}</h3>
                        <span className="text-[10px] text-muted-foreground">{ownedHere.length}/{all.length}</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {all.map((eclip) => {
                          const isOwned = ownedSlugs.has(eclip.slug);
                          const isEquipped = profile.equipped_ecliptar === eclip.slug;
                          const Icon = eclip.icon;
                          return (
                            <div
                              key={eclip.slug}
                              title={isOwned ? eclip.name : "Locked"}
                              className={cn(
                                "relative p-3 border text-center rounded",
                                isOwned ? `${arch.borderColor} bg-secondary/30` : "border-border/40 opacity-50",
                                isEquipped && "ring-2 ring-neon-purple shadow-[0_0_18px_rgba(168,85,247,0.55)]",
                              )}
                            >
                              {!isOwned && (
                                <Lock className="absolute top-1 right-1 w-3 h-3 text-muted-foreground" />
                              )}
                              <Icon className={cn("w-6 h-6 mx-auto", isOwned ? arch.color : "text-muted-foreground")} />
                              <p className={cn("text-[10px] mt-1 font-bold tracking-widest truncate", isOwned ? arch.color : "text-muted-foreground")}>
                                {eclip.name}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div className="glass-panel p-6">
            <div className="flex items-center gap-2 mb-5">
              <Activity className="w-4 h-4 text-neon-pink" />
              <h2 className="font-display font-bold text-sm tracking-widest uppercase">Activity</h2>
            </div>
            {feed.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Nothing here yet.</p>
            ) : (
              <ul className="space-y-3">
                {feed.map((item, idx) => <FeedRow key={idx} item={item} />)}
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

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - +new Date(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === "thread") {
    const t = item.thread;
    return (
      <li className="border-b border-border/40 pb-2 last:border-0">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-neon-pink mb-1">
          <MessageSquare className="w-3 h-3" />STARTED THREAD
          <span className="ml-auto text-muted-foreground">{timeAgo(t.created_at)}</span>
        </div>
        <Link to="/forum/$threadId" params={{ threadId: t.id }} className="text-xs font-medium hover:text-neon-pink line-clamp-2">
          {t.title}
        </Link>
        <p className="text-[10px] text-muted-foreground mt-0.5">{t.votes} votes · {t.answer_count} answers</p>
      </li>
    );
  }
  if (item.kind === "answer") {
    const a = item.answer;
    return (
      <li className="border-b border-border/40 pb-2 last:border-0">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-neon-cyan mb-1">
          <MessageSquare className="w-3 h-3" />REPLIED
          <span className="ml-auto text-muted-foreground">{timeAgo(a.created_at)}</span>
        </div>
        <Link to="/forum/$threadId" params={{ threadId: a.thread_id }} className="text-xs text-foreground/90 hover:text-neon-cyan line-clamp-2">
          {a.body.slice(0, 140)}{a.body.length > 140 ? "…" : ""}
        </Link>
      </li>
    );
  }
  // ecliptar
  const e = item.ecliptar;
  const arch = ARCHETYPES[e.archetype as MonsterArchetypeKey];
  return (
    <li className="border-b border-border/40 pb-2 last:border-0">
      <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-neon-purple mb-1">
        <Sparkles className="w-3 h-3" />CLAIMED COMPANION
        <span className="ml-auto text-muted-foreground">{timeAgo(e.claimed_at)}</span>
      </div>
      <p className={cn("text-xs font-bold", arch?.color ?? "text-foreground")}>{e.ecliptar_name}</p>
      {arch && <p className="text-[10px] text-muted-foreground">{arch.name}</p>}
    </li>
  );
}
