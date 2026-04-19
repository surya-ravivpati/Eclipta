import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ShieldCheck, Loader2, ExternalLink, Check, X, Trash2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useModerator } from "@/hooks/use-moderator";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/forum")({
  head: () => ({
    meta: [
      { title: "Forum Moderation – Eclipta" },
      { name: "description", content: "Review reported threads, answers, and comments." },
    ],
  }),
  component: AdminForumPage,
});

type Report = {
  id: string;
  reporter_id: string;
  target_type: "thread" | "answer" | "comment";
  target_id: string;
  reason: string;
  status: "pending" | "reviewed" | "dismissed";
  created_at: string;
  resolved_at: string | null;
};

function AdminForumPage() {
  const { isModerator, loading: roleLoading } = useModerator();
  const [reports, setReports] = useState<Report[]>([]);
  const [snippets, setSnippets] = useState<Record<string, { title?: string; body: string; author?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = async () => {
    setLoading(true);
    let q = supabase.from("forum_reports").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter === "pending") q = q.eq("status", "pending");
    const { data } = await q;
    const list = (data as Report[]) || [];
    setReports(list);
    setLoading(false);

    // Fetch snippet content for each report's target
    const grouped = { thread: [] as string[], answer: [] as string[], comment: [] as string[] };
    list.forEach((r) => grouped[r.target_type]?.push(r.target_id));

    const next: typeof snippets = {};
    const [tRes, aRes, cRes] = await Promise.all([
      grouped.thread.length
        ? supabase.from("forum_threads").select("id, title, body, author_name").in("id", grouped.thread)
        : Promise.resolve({ data: [] as any[] }),
      grouped.answer.length
        ? supabase.from("forum_answers").select("id, body, author_name").in("id", grouped.answer)
        : Promise.resolve({ data: [] as any[] }),
      grouped.comment.length
        ? supabase.from("forum_comments").select("id, body, author_name").in("id", grouped.comment)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    (tRes.data || []).forEach((row: any) => { next[row.id] = { title: row.title, body: row.body, author: row.author_name }; });
    (aRes.data || []).forEach((row: any) => { next[row.id] = { body: row.body, author: row.author_name }; });
    (cRes.data || []).forEach((row: any) => { next[row.id] = { body: row.body, author: row.author_name }; });
    setSnippets(next);
  };

  useEffect(() => { if (isModerator) load(); }, [isModerator, filter]);

  const setStatus = async (id: string, status: "reviewed" | "dismissed") => {
    const { error } = await supabase.from("forum_reports")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`);
    load();
  };

  const deleteTarget = async (r: Report) => {
    if (!confirm(`Permanently delete this ${r.target_type}?`)) return;
    const table = r.target_type === "thread" ? "forum_threads" : r.target_type === "answer" ? "forum_answers" : "forum_comments";
    const { error } = await supabase.from(table).delete().eq("id", r.target_id);
    if (error) return toast.error(error.message);
    await setStatus(r.id, "reviewed");
    toast.success(`${r.target_type} removed`);
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background"><Navbar />
        <div className="flex justify-center pt-32"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
      </div>
    );
  }

  if (!isModerator) {
    return (
      <div className="min-h-screen bg-background text-foreground"><Navbar />
        <div className="max-w-xl mx-auto px-6 pt-32 text-center">
          <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold mb-2">Moderator access required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This page is restricted to forum moderators and admins.
          </p>
          <Link to="/forum" className="text-neon-purple hover:underline text-sm font-bold tracking-widest">← BACK TO FORUM</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <section className="pt-24 pb-16 max-w-4xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan text-[10px] font-bold tracking-widest mb-3">
            <ShieldCheck className="w-3 h-3" />MODERATION
          </div>
          <h1 className="text-4xl font-bold font-display tracking-tight">Forum Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Review community-flagged content. Mark reviewed or dismiss as appropriate.</p>
        </motion.div>

        <div className="flex gap-2 mb-4">
          {(["pending", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-[10px] font-bold tracking-widest border transition-colors ${
                filter === f ? "border-neon-purple bg-neon-purple/10 text-neon-purple" : "border-border text-muted-foreground hover:border-neon-purple/40"
              }`}
            >{f.toUpperCase()}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No {filter === "pending" ? "pending " : ""}reports. The community is being kind.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.id} className="glass-panel p-5">
                <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                  <div>
                    <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 border ${
                      r.status === "pending" ? "border-neon-pink text-neon-pink" :
                      r.status === "reviewed" ? "border-neon-cyan text-neon-cyan" : "border-border text-muted-foreground"
                    }`}>{r.status.toUpperCase()}</span>
                    <span className="ml-2 text-[10px] font-bold tracking-widest text-muted-foreground bg-secondary/50 px-2 py-0.5 border border-border">
                      {r.target_type.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-foreground mb-3"><span className="text-muted-foreground">Reason:</span> {r.reason}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {r.target_type === "thread" && (
                    <Link to="/forum/$threadId" params={{ threadId: r.target_id }} className="text-[11px] font-bold tracking-widest text-neon-purple hover:underline inline-flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />OPEN THREAD
                    </Link>
                  )}
                  {r.status === "pending" && (
                    <>
                      <button onClick={() => setStatus(r.id, "reviewed")} className="px-3 py-1 text-[10px] font-bold tracking-widest border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10 transition-colors inline-flex items-center gap-1">
                        <Check className="w-3 h-3" />MARK REVIEWED
                      </button>
                      <button onClick={() => setStatus(r.id, "dismissed")} className="px-3 py-1 text-[10px] font-bold tracking-widest border border-border text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                        <X className="w-3 h-3" />DISMISS
                      </button>
                    </>
                  )}
                  <button onClick={() => deleteTarget(r)} className="px-3 py-1 text-[10px] font-bold tracking-widest border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors inline-flex items-center gap-1">
                    <Trash2 className="w-3 h-3" />REMOVE {r.target_type.toUpperCase()}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
