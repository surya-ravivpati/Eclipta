import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronUp, ChevronDown, ArrowLeft, Loader2, Check, Tag, Clock, MessageCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/forum/$threadId")({
  head: () => ({
    meta: [
      { title: "Thread – Eclipta Forum" },
      { name: "description", content: "Discussion thread on the Eclipta community forum." },
    ],
  }),
  component: ThreadPage,
});

type Thread = {
  id: string; user_id: string; author_name: string; title: string; body: string;
  course: string; tags: string[]; solved: boolean; votes: number; answer_count: number;
  view_count: number; created_at: string;
};
type Answer = {
  id: string; thread_id: string; user_id: string; author_name: string; body: string;
  votes: number; accepted: boolean; created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ThreadPage() {
  const { threadId } = useParams({ from: "/_authenticated/forum/$threadId" });
  const { user } = useAuth();
  const [thread, setThread] = useState<Thread | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [votes, setVotes] = useState<Record<string, number>>({}); // key: `${type}:${id}`

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from("forum_threads").select("*").eq("id", threadId).maybeSingle(),
      supabase.from("forum_answers").select("*").eq("thread_id", threadId).order("accepted", { ascending: false }).order("votes", { ascending: false }),
    ]);
    setThread(t as Thread | null);
    setAnswers((a as Answer[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [threadId]);

  // Track view (unique per user)
  useEffect(() => {
    if (!user || !thread) return;
    supabase.from("forum_thread_views").insert({ thread_id: thread.id, user_id: user.id }).then(() => {});
  }, [user, thread?.id]);

  // Load user's votes for this thread + its answers
  useEffect(() => {
    if (!user || !thread) return;
    const ids = [thread.id, ...answers.map((a) => a.id)];
    supabase.from("forum_votes").select("target_type,target_id,value")
      .eq("user_id", user.id).in("target_id", ids)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, number> = {};
        data.forEach((v: { target_type: string; target_id: string; value: number }) => {
          map[`${v.target_type}:${v.target_id}`] = v.value;
        });
        setVotes(map);
      });
  }, [user, thread?.id, answers.length]);

  const vote = async (targetType: "thread" | "answer", targetId: string, dir: 1 | -1) => {
    if (!user) return toast.error("Sign in to vote");
    const key = `${targetType}:${targetId}`;
    const current = votes[key] ?? 0;
    const next = { ...votes };
    let delta = 0;
    if (current === dir) {
      delete next[key];
      delta = -dir;
      await supabase.from("forum_votes").delete()
        .eq("user_id", user.id).eq("target_type", targetType).eq("target_id", targetId);
    } else {
      next[key] = dir;
      delta = current === 0 ? dir : dir * 2;
      await supabase.from("forum_votes").upsert({
        user_id: user.id, target_type: targetType, target_id: targetId, value: dir,
      }, { onConflict: "user_id,target_type,target_id" });
    }
    setVotes(next);
    if (targetType === "thread" && thread) setThread({ ...thread, votes: thread.votes + delta });
    if (targetType === "answer") setAnswers((prev) => prev.map((a) => a.id === targetId ? { ...a, votes: a.votes + delta } : a));
  };

  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !thread) return;
    if (reply.trim().length < 10) return toast.error("Answer must be at least 10 characters");
    setSubmitting(true);
    const { data: prof } = await supabase.from("user_profiles").select("username").eq("user_id", user.id).maybeSingle();
    const author_name = prof?.username || user.email?.split("@")[0] || "Learner";
    const { error } = await supabase.from("forum_answers").insert({
      thread_id: thread.id, user_id: user.id, author_name, body: reply.trim().slice(0, 4000),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setReply("");
    toast.success("Answer posted");
    load();
  };

  const acceptAnswer = async (answerId: string) => {
    if (!user || !thread || thread.user_id !== user.id) return;
    const { error } = await supabase.from("forum_answers").update({ accepted: true }).eq("id", answerId);
    if (error) return toast.error(error.message);
    toast.success("Answer accepted");
    load();
  };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <section className="pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-6">
          <Link to="/forum" className="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground hover:text-neon-purple mb-6 transition-colors">
            <ArrowLeft className="w-3 h-3" />BACK TO FORUM
          </Link>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
          ) : !thread ? (
            <div className="text-center py-16 text-muted-foreground">Thread not found.</div>
          ) : (
            <>
              <motion.div className="glass-panel p-6 mb-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <button onClick={() => vote("thread", thread.id, 1)} className={`p-1 ${votes[`thread:${thread.id}`] === 1 ? "text-neon-purple" : "text-muted-foreground hover:text-foreground"}`}><ChevronUp className="w-5 h-5" /></button>
                    <span className={`text-sm font-bold font-display ${thread.votes > 0 ? "text-neon-purple" : "text-muted-foreground"}`}>{thread.votes}</span>
                    <button onClick={() => vote("thread", thread.id, -1)} className={`p-1 ${votes[`thread:${thread.id}`] === -1 ? "text-neon-pink" : "text-muted-foreground hover:text-foreground"}`}><ChevronDown className="w-5 h-5" /></button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold font-display tracking-tight mb-3 leading-snug">
                      {thread.solved && <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 px-2 py-0.5 mr-2 align-middle">SOLVED</span>}
                      {thread.title}
                    </h1>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap mb-4">{thread.body}</p>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className="text-[10px] font-bold tracking-widest text-muted-foreground bg-secondary/50 px-2 py-0.5 border border-border">{thread.course}</span>
                      {thread.tags.map((t) => <span key={t} className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5"><Tag className="w-2.5 h-2.5" />{t}</span>)}
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                      <span className="font-medium text-foreground">{thread.author_name}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(thread.created_at)}</span>
                      <span>{thread.view_count.toLocaleString()} views</span>
                    </div>
                  </div>
                </div>
              </motion.div>

              <h2 className="font-display font-bold text-lg tracking-tight mb-3 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />{answers.length} {answers.length === 1 ? "Answer" : "Answers"}
              </h2>

              <div className="space-y-3 mb-8">
                {answers.map((a) => (
                  <div key={a.id} className={`glass-panel p-5 ${a.accepted ? "border-neon-cyan/40" : ""}`}>
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => vote("answer", a.id, 1)} className={`p-1 ${votes[`answer:${a.id}`] === 1 ? "text-neon-purple" : "text-muted-foreground hover:text-foreground"}`}><ChevronUp className="w-5 h-5" /></button>
                        <span className={`text-sm font-bold font-display ${a.votes > 0 ? "text-neon-purple" : "text-muted-foreground"}`}>{a.votes}</span>
                        <button onClick={() => vote("answer", a.id, -1)} className={`p-1 ${votes[`answer:${a.id}`] === -1 ? "text-neon-pink" : "text-muted-foreground hover:text-foreground"}`}><ChevronDown className="w-5 h-5" /></button>
                      </div>
                      <div className="flex-1 min-w-0">
                        {a.accepted && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest text-neon-cyan border border-neon-cyan/30 bg-neon-cyan/10 px-2 py-0.5 mb-2">
                            <Check className="w-3 h-3" />ACCEPTED
                          </div>
                        )}
                        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap mb-3">{a.body}</p>
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">{a.author_name}</span> · {timeAgo(a.created_at)}
                          </div>
                          {!a.accepted && user?.id === thread.user_id && (
                            <button onClick={() => acceptAnswer(a.id)} className="text-[10px] font-bold tracking-widest text-neon-cyan hover:bg-neon-cyan/10 px-2 py-1 transition-colors">ACCEPT ANSWER</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {answers.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">No answers yet. Be the first to help.</p>
                )}
              </div>

              <form onSubmit={submitAnswer} className="glass-panel p-5">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Your answer</label>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder="Share your insight, code snippet, or pointer to a resource."
                  className="w-full mt-2 bg-secondary/30 border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-purple resize-none"
                />
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[10px] text-muted-foreground">{reply.length}/4000</span>
                  <button type="submit" disabled={submitting || reply.trim().length < 10} className="px-5 py-2 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2">
                    {submitting && <Loader2 className="w-3 h-3 animate-spin" />}POST ANSWER
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
