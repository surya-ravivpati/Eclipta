import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { MessageSquare, Search, Users, BookOpen, ChevronUp, ChevronDown, Clock, MessageCircle, Plus, X, Loader2, Tag, Trash2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useModerator } from "@/hooks/use-moderator";
import { toast } from "sonner";
import { findProfanity } from "@/lib/profanity";

type Thread = {
  id: string;
  user_id: string;
  author_name: string;
  title: string;
  body: string;
  course: string;
  tags: string[];
  solved: boolean;
  votes: number;
  answer_count: number;
  view_count: number;
  created_at: string;
};

const COURSES = ["General", "FAANG Interview Prep", "Machine Learning Foundations", "Cybersecurity Fundamentals", "System Design", "Mathematics", "Other"];
const FILTER_TABS = ["All", ...COURSES];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}


function ThreadCard({ thread, userVote, onVote, canDelete, onDelete }: {
  thread: Thread;
  userVote: number | null;
  onVote: (dir: 1 | -1) => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const handleVote = (e: React.MouseEvent, dir: 1 | -1) => {
    e.preventDefault();
    e.stopPropagation();
    onVote(dir);
  };
  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete();
  };

  return (
    <Link
      to="/forum/$threadId"
      params={{ threadId: thread.id }}
      className="block"
    >
      <motion.div
        className="glass-panel p-5 hover:border-neon-purple/40 transition-colors group"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex gap-4">
          <div className="flex flex-col items-center gap-1 pt-1">
            <button
              onClick={(e) => handleVote(e, 1)}
              className={`p-1 transition-colors ${userVote === 1 ? "text-neon-purple" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="Upvote"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <span className={`text-sm font-bold font-display ${thread.votes > 0 ? "text-neon-purple" : "text-muted-foreground"}`}>
              {thread.votes}
            </span>
            <button
              onClick={(e) => handleVote(e, -1)}
              className={`p-1 transition-colors ${userVote === -1 ? "text-neon-pink" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="Downvote"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold font-display text-base tracking-tight group-hover:text-neon-purple transition-colors leading-snug mb-2">
              {thread.solved && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 px-2 py-0.5 mr-2 align-middle">
                  SOLVED
                </span>
              )}
              {thread.title}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">
              {thread.body}
            </p>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground bg-secondary/50 px-2 py-0.5 border border-border">
                {thread.course}
              </span>
              {thread.tags.map((tag) => (
                <Link
                  key={tag}
                  to="/tags/$tag"
                  params={{ tag }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-muted-foreground hover:text-neon-purple inline-flex items-center gap-0.5"
                >
                  <Tag className="w-2.5 h-2.5" />{tag}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
              <span className="font-medium text-foreground">{thread.author_name}</span>
              <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{thread.answer_count}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(thread.created_at)}</span>
              <span>{thread.view_count.toLocaleString()} views</span>
              {canDelete && (
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1 hover:text-destructive transition-colors ml-auto"
                  aria-label="Delete thread"
                >
                  <Trash2 className="w-3 h-3" />Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

function NewThreadDialog({ open, onClose, onCreated, lockedCourse }: { open: boolean; onClose: () => void; onCreated: () => void; lockedCourse?: string }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [course, setCourse] = useState(lockedCourse ?? "General");
  const [tagsInput, setTagsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (title.trim().length < 8) return toast.error("Title must be at least 8 characters");
    if (body.trim().length < 20) return toast.error("Body must be at least 20 characters");
    const dirty = findProfanity(title) || findProfanity(body) || findProfanity(tagsInput);
    if (dirty) return toast.error("Please rephrase — your post contains language we don't allow.");

    setSubmitting(true);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
      .filter((t) => t.length > 0)
      .slice(0, 5);

    const { data: prof } = await supabase.from("user_profiles").select("username").eq("user_id", user.id).maybeSingle();
    const author_name = prof?.username || user.email?.split("@")[0] || "Learner";

    const { error } = await supabase.from("forum_threads").insert({
      user_id: user.id,
      author_name,
      title: title.trim().slice(0, 200),
      body: body.trim().slice(0, 4000),
      course,
      tags,
    });

    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Thread posted");
    setTitle(""); setBody(""); setTagsInput(""); setCourse(lockedCourse ?? "General");
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4 overflow-y-auto" onClick={onClose}>
      <div className="glass-panel w-full max-w-2xl p-6 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-xl tracking-tight">Start a thread</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Be specific. What are you trying to figure out?"
              className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Category</label>
              {lockedCourse ? (
                <div className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm text-neon-purple">
                  {lockedCourse}
                </div>
              ) : (
                <select
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
                >
                  {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Tags (comma separated, max 5)</label>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="algorithms, dp, mindset"
                className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              rows={6}
              placeholder="Provide context, what you've tried, and where you got stuck."
              className="w-full mt-1 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{body.length}/4000</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold tracking-widest border border-border text-muted-foreground hover:text-foreground transition-colors">CANCEL</button>
            <button type="submit" disabled={submitting} className="px-5 py-2 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2">
              {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
              POST THREAD
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Forum({ defaultCourse, lockCourse = false, heading, subheading }: {
  defaultCourse?: string;
  lockCourse?: boolean;
  heading?: React.ReactNode;
  subheading?: React.ReactNode;
} = {}) {
  const { user, isAuthenticated } = useAuth();
  const { isModerator } = useModerator();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ threads: number; answers: number; contributors: number } | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  const [selectedCourse, setSelectedCourse] = useState(defaultCourse ?? "All");
  const [sortBy, setSortBy] = useState<"votes" | "recent" | "answers">("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNew, setShowNew] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from("forum_threads").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.rpc("get_forum_stats"),
    ]);
    setThreads((t as Thread[]) || []);
    const row = Array.isArray(s) ? s[0] : s;
    if (row) setStats({ threads: Number(row.threads), answers: Number(row.answers), contributors: Number(row.contributors) });
    setLoading(false);
  };

  const fetchUserVotes = async (uid: string) => {
    const { data } = await supabase
      .from("forum_votes")
      .select("target_id, value")
      .eq("user_id", uid)
      .eq("target_type", "thread");
    if (data) {
      const map: Record<string, number> = {};
      data.forEach((v: { target_id: string; value: number }) => { map[v.target_id] = v.value; });
      setUserVotes(map);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (user) fetchUserVotes(user.id); }, [user]);

  const handleVote = async (threadId: string, dir: 1 | -1) => {
    if (!user) return toast.error("Sign in to vote");
    const current = userVotes[threadId] ?? 0;
    const optimistic = { ...userVotes };
    let delta = 0;

    if (current === dir) {
      delete optimistic[threadId];
      delta = -dir;
      await supabase.from("forum_votes").delete()
        .eq("user_id", user.id).eq("target_type", "thread").eq("target_id", threadId);
    } else {
      optimistic[threadId] = dir;
      delta = current === 0 ? dir : dir * 2;
      await supabase.from("forum_votes").upsert({
        user_id: user.id, target_type: "thread", target_id: threadId, value: dir,
      }, { onConflict: "user_id,target_type,target_id" });
    }
    setUserVotes(optimistic);
    setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, votes: t.votes + delta } : t));
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!confirm("Delete this thread permanently? All answers and comments will be removed.")) return;
    const { error } = await supabase.from("forum_threads").delete().eq("id", threadId);
    if (error) return toast.error(error.message);
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    toast.success("Thread deleted");
  };

  const filtered = useMemo(() => {
    return threads
      .filter((t) => selectedCourse === "All" || t.course === selectedCourse)
      .filter((t) => !searchQuery ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.tags.some((tag) => tag.includes(searchQuery.toLowerCase()))
      )
      .sort((a, b) => {
        if (sortBy === "votes") return b.votes - a.votes;
        if (sortBy === "answers") return b.answer_count - a.answer_count;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [threads, selectedCourse, searchQuery, sortBy]);

  const trendingTags = useMemo(() => {
    const counts = new Map<string, number>();
    threads.forEach((t) => t.tags?.forEach((tag) => {
      if (!tag) return;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }));
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [threads]);

  return (
    <section className="min-h-screen pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div className="text-center mb-10" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-neon-pink/30 bg-neon-pink/10 text-neon-pink text-xs font-bold tracking-widest mb-6">
            <Users className="w-3 h-3" />{lockCourse ? "COURSE COMMUNITY" : "COMMUNITY"}
          </div>
          <h1 className="text-5xl md:text-6xl font-bold font-display tracking-tight mb-4">
            {heading ?? <>The <span className="text-neon-pink">Forum</span></>}
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            {subheading ?? "Ask questions, share insights, and learn from the community. The best answers rise to the top."}
          </p>
        </motion.div>

        {stats && (stats.threads > 0 || stats.answers > 0) && (
          <div className="flex flex-wrap justify-center gap-8 md:gap-12 mb-10 py-4 border-y border-border">
            <div className="text-center">
              <p className="text-2xl font-bold font-display tabular-nums">{stats.threads}</p>
              <p className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">Threads</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold font-display tabular-nums">{stats.answers}</p>
              <p className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">Answers</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold font-display tabular-nums">{stats.contributors}</p>
              <p className="text-[10px] tracking-widest text-muted-foreground font-bold uppercase">Contributors</p>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search threads, tags..."
              className="w-full bg-secondary/30 border border-input pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple"
            />
          </div>
          {isAuthenticated ? (
            <button
              onClick={() => setShowNew(true)}
              className="px-5 py-2.5 text-xs font-bold tracking-widest bg-neon-pink text-foreground hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />NEW THREAD
            </button>
          ) : (
            <Link
              to="/login"
              className="px-5 py-2.5 text-xs font-bold tracking-widest border border-neon-pink/40 text-neon-pink hover:bg-neon-pink/10 transition-colors inline-flex items-center justify-center"
            >
              SIGN IN TO POST
            </Link>
          )}
          {isModerator && (
            <Link to="/admin/forum" className="px-4 py-2.5 text-xs font-bold tracking-widest border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10 transition-colors inline-flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />MOD QUEUE
            </Link>
          )}
        </div>

        {!lockCourse && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {FILTER_TABS.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCourse(c)}
                className={`px-3 py-1.5 text-[10px] font-bold tracking-widest border transition-colors whitespace-nowrap ${
                  selectedCourse === c
                    ? "border-neon-purple bg-neon-purple/10 text-neon-purple"
                    : "border-border text-muted-foreground hover:border-neon-purple/40"
                }`}
              >
                {c.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 mb-6 text-[10px] font-bold tracking-widest text-muted-foreground">
          <span>SORT BY:</span>
          {(["recent", "votes", "answers"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`transition-colors ${sortBy === s ? "text-neon-purple" : "hover:text-foreground"}`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
          <div className="space-y-3 min-w-0">
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filtered.map((thread) => (
                  <ThreadCard
                    key={thread.id}
                    thread={thread}
                    userVote={userVotes[thread.id] ?? null}
                    onVote={(dir) => handleVote(thread.id, dir)}
                    canDelete={!!user && (user.id === thread.user_id || isModerator)}
                    onDelete={() => handleDeleteThread(thread.id)}
                  />
                ))}
              </AnimatePresence>
            )}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm mb-4">{threads.length === 0 ? "No threads yet — be the first to start a discussion." : "No threads match your filters."}</p>
                {isAuthenticated && threads.length === 0 && (
                  <button onClick={() => setShowNew(true)} className="px-5 py-2 text-xs font-bold tracking-widest bg-neon-pink text-foreground hover:opacity-90 transition-opacity inline-flex items-center gap-2">
                    <Plus className="w-3.5 h-3.5" />START THE FIRST THREAD
                  </button>
                )}
              </div>
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="glass-panel p-4 sticky top-24">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-3.5 h-3.5 text-neon-pink" />
                <h3 className="text-[10px] font-bold tracking-widest text-neon-pink">TRENDING TAGS</h3>
              </div>
              {trendingTags.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No tags yet. Add some when you post.</p>
              ) : (
                <ul className="space-y-1.5">
                  {trendingTags.map(({ tag, count }) => (
                    <li key={tag}>
                      <button
                        onClick={() => setSearchQuery(tag)}
                        className="w-full flex items-center justify-between text-left group"
                      >
                        <span className="text-xs text-foreground group-hover:text-neon-purple transition-colors truncate">#{tag}</span>
                        <span className="text-[10px] font-bold text-muted-foreground tabular-nums">{count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>

        <motion.div
          className="mt-16 glass-panel p-8 border border-neon-cyan/20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-14 h-14 bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-neon-cyan" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="font-bold font-display text-lg tracking-tight mb-1">Peer Tutoring & Safe Messaging</h3>
              <p className="text-sm text-muted-foreground">
                Connect with other learners directly. Message, tutor, and collaborate in a moderated environment designed for focused learning.
              </p>
            </div>
            <button className="px-5 py-2 text-xs font-bold tracking-widest border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-colors shrink-0">
              COMING SOON
            </button>
          </div>
        </motion.div>
      </div>

      <NewThreadDialog open={showNew} onClose={() => setShowNew(false)} onCreated={fetchData} lockedCourse={lockCourse ? selectedCourse : undefined} />
    </section>
  );
}
