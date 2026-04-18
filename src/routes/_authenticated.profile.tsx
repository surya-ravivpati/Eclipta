import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { User, Trophy, Flame, Target, Zap, BookOpen, Sparkles, Loader2, MessageSquare, LogOut, Sun, Moon, Settings, Check, Lock } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { ARCHETYPES } from "@/components/battles/archetypes";
import { ECLIPTARS, getEcliptarsByArchetype } from "@/lib/ecliptars";
import { useOwnedEcliptars } from "@/hooks/use-player-xp";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import type { MonsterArchetypeKey } from "@/lib/trophy-road-data";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile – Eclipta" },
      { name: "description", content: "Settings, XP, ecliptars, courses, and forum activity." },
    ],
  }),
  component: ProfilePage,
});

type Profile = {
  username: string | null;
  xp: number; current_streak: number; best_streak: number;
  total_correct: number; total_questions: number; total_sessions: number;
  preferred_pace: string; preferred_style: string;
};
type Ecliptar = { id: string; ecliptar_name: string; archetype: string; claimed_at: string };
type Enrollment = { id: string; course_slug: string; course_title: string; enrolled_at: string };
type ForumActivity = { id: string; title: string; created_at: string };

function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ecliptars, setEcliptars] = useState<Ecliptar[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [threads, setThreads] = useState<ForumActivity[]>([]);
  const [answersCount, setAnswersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!user) return;
    const [p, e, en, t, a] = await Promise.all([
      supabase.from("user_profiles").select("username,xp,current_streak,best_streak,total_correct,total_questions,total_sessions,preferred_pace,preferred_style").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_ecliptars").select("id,ecliptar_name,archetype,claimed_at").eq("user_id", user.id).order("claimed_at", { ascending: false }),
      supabase.from("enrollments").select("id,course_slug,course_title,enrolled_at").eq("user_id", user.id).order("enrolled_at", { ascending: false }),
      supabase.from("forum_threads").select("id,title,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("forum_answers").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    setProfile((p.data as Profile) || null);
    setEcliptars((e.data as Ecliptar[]) || []);
    setEnrollments((en.data as Enrollment[]) || []);
    setThreads((t.data as ForumActivity[]) || []);
    setAnswersCount(a.count || 0);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
  };

  if (!user) return null;

  const displayName = profile?.username || user.email?.split("@")[0] || "Learner";
  const accuracy = profile && profile.total_questions > 0
    ? Math.round((profile.total_correct / profile.total_questions) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <section className="pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-6">
          {/* Header */}
          <motion.div
            className="glass-panel p-8 mb-6 flex flex-col md:flex-row items-center md:items-start gap-6"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-20 h-20 rounded-full bg-neon-purple/10 border-2 border-neon-purple/40 flex items-center justify-center shrink-0">
              <User className="w-10 h-10 text-neon-purple" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl font-bold font-display tracking-tight">{displayName}</h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
                <span className="text-[10px] font-bold tracking-widest bg-neon-purple/10 text-neon-purple border border-neon-purple/30 px-2 py-0.5">
                  {profile?.preferred_pace?.toUpperCase() || "NORMAL"} PACE
                </span>
                <span className="text-[10px] font-bold tracking-widest bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 px-2 py-0.5">
                  {profile?.preferred_style?.toUpperCase() || "MIXED"} STYLE
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-xs font-bold tracking-widest border border-border hover:border-neon-pink text-muted-foreground hover:text-neon-pink transition-colors inline-flex items-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />SIGN OUT
            </button>
          </motion.div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
          ) : (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard icon={<Zap className="w-4 h-4" />} label="XP" value={profile?.xp ?? 0} color="text-neon-purple" />
                <StatCard icon={<Flame className="w-4 h-4" />} label="Streak" value={profile?.current_streak ?? 0} color="text-neon-pink" />
                <StatCard icon={<Trophy className="w-4 h-4" />} label="Best Streak" value={profile?.best_streak ?? 0} color="text-neon-cyan" />
                <StatCard icon={<Target className="w-4 h-4" />} label="Accuracy" value={`${accuracy}%`} color="text-foreground" />
              </div>

              {/* Settings */}
              <SettingsPanel
                currentUsername={profile?.username ?? null}
                userId={user.id}
                onSaved={reload}
              />

              {/* Activity cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Card title="Enrolled Courses" icon={<BookOpen className="w-4 h-4 text-neon-cyan" />} count={enrollments.length}>
                  {enrollments.length === 0 ? (
                    <EmptyState text="No courses enrolled." cta={<Link to="/certified" className="text-neon-cyan hover:underline">Browse certified →</Link>} />
                  ) : (
                    <ul className="space-y-2">
                      {enrollments.slice(0, 6).map((en) => (
                        <li key={en.id} className="text-xs border-b border-border/50 pb-2">
                          <Link to="/certified/$slug" params={{ slug: en.course_slug }} className="font-medium hover:text-neon-cyan transition-colors">
                            {en.course_title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Forum Threads" icon={<MessageSquare className="w-4 h-4 text-neon-pink" />} count={threads.length}>
                  {threads.length === 0 ? (
                    <EmptyState text="No threads posted." cta={<Link to="/forum" className="text-neon-pink hover:underline">Start a discussion →</Link>} />
                  ) : (
                    <ul className="space-y-2">
                      {threads.slice(0, 5).map((t) => (
                        <li key={t.id} className="text-xs border-b border-border/50 pb-2">
                          <Link to="/forum/$threadId" params={{ threadId: t.id }} className="font-medium hover:text-neon-pink transition-colors line-clamp-1">
                            {t.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Lifetime Activity" icon={<Target className="w-4 h-4 text-foreground" />} count={null}>
                  <div className="space-y-2 text-xs">
                    <Row label="Sessions" value={profile?.total_sessions ?? 0} />
                    <Row label="Questions answered" value={profile?.total_questions ?? 0} />
                    <Row label="Correct" value={profile?.total_correct ?? 0} />
                    <Row label="Forum answers" value={answersCount} />
                  </div>
                </Card>

                <Card title="Ecliptars Claimed" icon={<Sparkles className="w-4 h-4 text-neon-purple" />} count={ecliptars.length}>
                  {ecliptars.length === 0 ? (
                    <EmptyState text="No ecliptars yet." cta={<Link to="/progress" className="text-neon-purple hover:underline">Walk the trophy road →</Link>} />
                  ) : (
                    <p className="text-xs text-muted-foreground">See full collection below ↓</p>
                  )}
                </Card>
              </div>

              {/* Embedded Collection */}
              <CollectionSection />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/* =================== Settings Panel =================== */

function SettingsPanel({ currentUsername, userId, onSaved }: {
  currentUsername: string | null; userId: string; onSaved: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [username, setUsername] = useState(currentUsername || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setUsername(currentUsername || ""); }, [currentUsername]);

  const validateUsername = (v: string) => /^[a-zA-Z0-9_]{3,20}$/.test(v);

  const saveUsername = async () => {
    const trimmed = username.trim();
    if (!validateUsername(trimmed)) {
      return toast.error("Username must be 3–20 chars: letters, numbers, underscores");
    }
    if (trimmed === currentUsername) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ username: trimmed })
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      if (error.code === "23505") return toast.error("That username is already taken");
      return toast.error(error.message);
    }
    toast.success("Username updated — visible publicly");
    onSaved();
  };

  return (
    <motion.div className="glass-panel p-6 mb-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center gap-2 mb-5">
        <Settings className="w-4 h-4 text-neon-purple" />
        <h2 className="font-display font-bold text-sm tracking-widest uppercase">Settings</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Username */}
        <div>
          <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Public Username</label>
          <p className="text-[11px] text-muted-foreground mt-1 mb-2">Shown on your forum threads and answers.</p>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              placeholder="your_username"
              className="flex-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
            />
            <button
              onClick={saveUsername}
              disabled={saving || username.trim() === (currentUsername || "")}
              className="px-4 py-2 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              SAVE
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">3–20 chars. Letters, numbers, underscores only.</p>
        </div>

        {/* Theme */}
        <div>
          <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Appearance</label>
          <p className="text-[11px] text-muted-foreground mt-1 mb-2">Switch between dark and light arena.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme("dark")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-bold tracking-widest border transition-colors inline-flex items-center justify-center gap-2",
                theme === "dark"
                  ? "border-neon-purple bg-neon-purple/10 text-neon-purple"
                  : "border-border text-muted-foreground hover:border-neon-purple/40"
              )}
            >
              <Moon className="w-3.5 h-3.5" />DARK
            </button>
            <button
              onClick={() => setTheme("light")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-bold tracking-widest border transition-colors inline-flex items-center justify-center gap-2",
                theme === "light"
                  ? "border-neon-purple bg-neon-purple/10 text-neon-purple"
                  : "border-border text-muted-foreground hover:border-neon-purple/40"
              )}
            >
              <Sun className="w-3.5 h-3.5" />LIGHT
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* =================== Embedded Collection =================== */

function CollectionSection() {
  const { slugs, loading } = useOwnedEcliptars();
  const total = ECLIPTARS.length;
  const owned = ECLIPTARS.filter((e) => slugs.has(e.slug)).length;
  const archetypeKeys = Object.keys(ARCHETYPES) as MonsterArchetypeKey[];

  return (
    <div className="mt-10">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-2">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-neon-purple/30 bg-neon-purple/10 text-neon-purple text-[10px] font-bold tracking-widest mb-2">
            <Sparkles className="w-3 h-3" />ECLIPTAR COLLECTION
          </div>
          <h2 className="text-3xl font-bold font-display tracking-tight">My Ecliptars</h2>
        </div>
        <p className="text-sm font-bold tracking-widest text-neon-purple">{owned} / {total} COLLECTED</p>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-10">Loading collection…</div>
      ) : (
        <div className="space-y-8">
          {archetypeKeys.map((archKey) => {
            const arch = ARCHETYPES[archKey];
            const eclips = getEcliptarsByArchetype(archKey);
            const ownedCount = eclips.filter((e) => slugs.has(e.slug)).length;

            return (
              <div key={archKey}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <arch.icon className={cn("w-6 h-6", arch.color)} />
                    <div>
                      <h3 className={cn("text-base font-bold font-display", arch.color)}>{arch.name}</h3>
                      <p className="text-[10px] font-bold tracking-widest text-muted-foreground">{arch.passive}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold tracking-widest px-2 py-1 rounded-full border",
                    ownedCount === eclips.length ? "border-emerald-500/50 text-emerald-400" : "border-border text-muted-foreground"
                  )}>
                    {ownedCount}/{eclips.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {eclips.map((e) => {
                    const isOwned = slugs.has(e.slug);
                    return (
                      <div
                        key={e.slug}
                        className={cn(
                          "glass-panel p-4 border text-center relative overflow-hidden",
                          isOwned ? arch.borderColor : "border-border/30 opacity-60"
                        )}
                      >
                        {!isOwned && (
                          <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] z-10 flex items-center justify-center">
                            <Lock className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <e.icon className={cn("w-10 h-10 mx-auto mb-2", isOwned ? arch.color : "text-muted-foreground")} />
                        <div className={cn("text-sm font-bold font-display", isOwned ? arch.color : "text-muted-foreground")}>{e.name}</div>
                        <div className="text-[9px] tracking-widest text-muted-foreground mt-1">{arch.name.toUpperCase()}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-center mt-10">
        <Link to="/progress" className="inline-block px-6 py-3 bg-neon-purple text-primary-foreground text-xs font-bold tracking-widest hover:opacity-90 transition-opacity">
          UNLOCK MORE ON THE TROPHY ROAD
        </Link>
      </div>
    </div>
  );
}

/* =================== Small UI helpers =================== */

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="glass-panel p-4">
      <div className={`flex items-center gap-2 mb-2 ${color}`}>{icon}<span className="text-[10px] font-bold tracking-widest uppercase">{label}</span></div>
      <p className={`text-2xl font-bold font-display tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function Card({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number | null; children: React.ReactNode }) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">{icon}<h3 className="font-display font-bold text-sm tracking-tight uppercase">{title}</h3></div>
        {count !== null && <span className="text-[10px] font-bold tracking-widest text-muted-foreground">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text, cta }: { text: string; cta: React.ReactNode }) {
  return (
    <div className="text-center py-4">
      <p className="text-xs text-muted-foreground mb-2">{text}</p>
      <p className="text-xs font-bold tracking-widest">{cta}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-b border-border/50 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
