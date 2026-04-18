import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { User, Trophy, Flame, Target, Zap, BookOpen, Sparkles, Loader2, MessageSquare, LogOut } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile – Eclipta" },
      { name: "description", content: "Your XP, streaks, ecliptars, enrolled courses, and forum activity." },
    ],
  }),
  component: ProfilePage,
});

type Profile = {
  xp: number; current_streak: number; best_streak: number;
  total_correct: number; total_questions: number; total_sessions: number;
  preferred_pace: string; preferred_style: string;
  weak_areas: string[] | null; strong_areas: string[] | null;
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

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [p, e, en, t, a] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
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
    })();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
  };

  if (!user) return null;

  const username = user.email?.split("@")[0] || "Learner";
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
              <h1 className="text-3xl font-bold font-display tracking-tight">{username}</h1>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ecliptars */}
                <Card title="Ecliptars Claimed" icon={<Sparkles className="w-4 h-4 text-neon-purple" />} count={ecliptars.length}>
                  {ecliptars.length === 0 ? (
                    <EmptyState text="No ecliptars yet." cta={<Link to="/collection" className="text-neon-purple hover:underline">Walk the trophy road →</Link>} />
                  ) : (
                    <ul className="space-y-2">
                      {ecliptars.slice(0, 6).map((e) => (
                        <li key={e.id} className="flex items-center justify-between text-xs border-b border-border/50 pb-2">
                          <span className="font-medium">{e.ecliptar_name}</span>
                          <span className="text-[10px] tracking-widest text-muted-foreground uppercase">{e.archetype}</span>
                        </li>
                      ))}
                      {ecliptars.length > 6 && <li className="text-[10px] text-muted-foreground text-center pt-1">+{ecliptars.length - 6} more</li>}
                    </ul>
                  )}
                </Card>

                {/* Enrollments */}
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

                {/* Forum activity */}
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

                {/* Activity numbers */}
                <Card title="Lifetime Activity" icon={<Target className="w-4 h-4 text-foreground" />} count={null}>
                  <div className="space-y-2 text-xs">
                    <Row label="Sessions" value={profile?.total_sessions ?? 0} />
                    <Row label="Questions answered" value={profile?.total_questions ?? 0} />
                    <Row label="Correct" value={profile?.total_correct ?? 0} />
                    <Row label="Forum answers" value={answersCount} />
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

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
