import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ShieldCheck, Loader2, ExternalLink, Check, X, Trash2, EyeOff, RotateCcw, Flag, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useModerator } from "@/hooks/use-moderator";
import { setModerationStatus } from "@/lib/moderation";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/forum")({
  head: () => ({
    meta: [
      { title: "Forum Moderation – Eclipta" },
      { name: "description", content: "Review reported and auto-flagged forum content." },
    ],
  }),
  component: AdminForumPage,
});

type QueueItem = {
  target_type: "thread" | "answer" | "comment";
  target_id: string;
  author_id: string;
  author_name: string | null;
  title: string | null;
  body: string;
  moderation_status: "visible" | "pending" | "hidden" | "removed";
  moderation_reason: string | null;
  moderation_score: number | null;
  moderation_category: string | null;
  report_count: number;
  hidden_at: string | null;
  created_at: string;
  updated_at: string;
};

type Report = {
  id: string;
  reporter_id: string;
  target_type: "thread" | "answer" | "comment";
  target_id: string;
  reason: string;
  status: "pending" | "reviewed" | "dismissed";
  created_at: string;
};

type ActionLog = {
  id: string;
  target_type: string;
  target_id: string | null;
  actor_id: string | null;
  action: string;
  source: string;
  category: string | null;
  score: number | null;
  reason: string | null;
  created_at: string;
};

function AdminForumPage() {
  const { isModerator, loading: roleLoading } = useModerator();
  const [tab, setTab] = useState<"queue" | "reports" | "log">("queue");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportSnippets, setReportSnippets] = useState<Record<string, { title?: string; body: string; author?: string; status?: string }>>({});
  const [log, setLog] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const loadQueue = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("admin_moderation_queue" as any) as any)
      .select("*")
      .order("hidden_at", { ascending: false, nullsFirst: false })
      .order("report_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setQueue((data as QueueItem[]) || []);
    setLoading(false);
  };

  const loadReports = async () => {
    setLoading(true);
    let q = supabase.from("forum_reports").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter === "pending") q = q.eq("status", "pending");
    const { data } = await q;
    const list = (data as Report[]) || [];
    setReports(list);

    const grouped = { thread: [] as string[], answer: [] as string[], comment: [] as string[] };
    list.forEach((r) => grouped[r.target_type]?.push(r.target_id));
    const next: typeof reportSnippets = {};
    const [tRes, aRes, cRes] = await Promise.all([
      grouped.thread.length
        ? supabase.from("forum_threads").select("id, title, body, author_name, moderation_status").in("id", grouped.thread)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : Promise.resolve({ data: [] as any[] }),
      grouped.answer.length
        ? supabase.from("forum_answers").select("id, body, author_name, moderation_status").in("id", grouped.answer)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : Promise.resolve({ data: [] as any[] }),
      grouped.comment.length
        ? supabase.from("forum_comments").select("id, body, author_name, moderation_status").in("id", grouped.comment)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : Promise.resolve({ data: [] as any[] }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tRes.data || []).forEach((row: any) => { next[row.id] = { title: row.title, body: row.body, author: row.author_name, status: row.moderation_status }; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (aRes.data || []).forEach((row: any) => { next[row.id] = { body: row.body, author: row.author_name, status: row.moderation_status }; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cRes.data || []).forEach((row: any) => { next[row.id] = { body: row.body, author: row.author_name, status: row.moderation_status }; });
    setReportSnippets(next);
    setLoading(false);
  };

  const loadLog = async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("moderation_actions" as any) as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setLog((data as ActionLog[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!isModerator) return;
    if (tab === "queue") loadQueue();
    else if (tab === "reports") loadReports();
    else loadLog();
  }, [isModerator, tab, filter]);

  const setStatus = async (target_type: "thread" | "answer" | "comment", target_id: string, status: "visible" | "hidden" | "removed", reason?: string) => {
    const r = await setModerationStatus(target_type, target_id, status, reason);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${status === "visible" ? "Restored" : status === "hidden" ? "Hidden" : "Removed"}`);
    if (tab === "queue") loadQueue();
    else if (tab === "reports") loadReports();
  };

  const dismissReport = async (id: string) => {
    const { error } = await supabase.from("forum_reports")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Dismissed");
    loadReports();
  };

  const deleteTarget = async (r: Report) => {
    if (!confirm(`Permanently delete this ${r.target_type}? Use 'Remove' instead to keep the row for audit.`)) return;
    const table = r.target_type === "thread" ? "forum_threads" : r.target_type === "answer" ? "forum_answers" : "forum_comments";
    const { error } = await supabase.from(table).delete().eq("id", r.target_id);
    if (error) return toast.error(error.message);
    toast.success(`${r.target_type} deleted`);
    loadReports();
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex justify-center pt-32"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
      </div>
    );
  }

  if (!isModerator) {
    return (
      <div className="min-h-screen bg-background text-foreground">
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
      <section className="pt-24 pb-16 max-w-4xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan text-[10px] font-bold tracking-widest mb-3">
            <ShieldCheck className="w-3 h-3" />MODERATION
          </div>
          <h1 className="text-4xl font-bold font-display tracking-tight">Forum Moderation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review the auto-flagged + reported queue, manage user reports, and audit moderation actions.
          </p>
        </motion.div>

        <div className="flex gap-2 mb-4">
          {(["queue","reports","log"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[10px] font-bold tracking-widest border transition-colors ${
                tab === t ? "border-neon-purple bg-neon-purple/10 text-neon-purple" : "border-border text-muted-foreground hover:border-neon-purple/40"
              }`}
            >
              {t === "queue" ? "AUTO-FLAGGED QUEUE" : t === "reports" ? "USER REPORTS" : "AUDIT LOG"}
            </button>
          ))}
        </div>

        {tab === "reports" && (
          <div className="flex gap-2 mb-4">
            {(["pending","all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-[10px] font-bold tracking-widest border transition-colors ${
                  filter === f ? "border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan" : "border-border text-muted-foreground hover:border-neon-cyan/40"
                }`}
              >{f.toUpperCase()}</button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neon-purple" /></div>
        ) : tab === "queue" ? (
          queue.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nothing in the queue. The forum is clean.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {queue.map((q) => (
                <div key={`${q.target_type}-${q.target_id}`} className="glass-panel p-5">
                  <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 border ${
                        q.moderation_status === "hidden"  ? "border-neon-pink text-neon-pink"
                        : q.moderation_status === "removed" ? "border-destructive text-destructive"
                        : "border-neon-cyan text-neon-cyan"
                      }`}>{q.moderation_status.toUpperCase()}</span>
                      <span className="text-[10px] font-bold tracking-widest text-muted-foreground bg-secondary/50 px-2 py-0.5 border border-border">
                        {q.target_type.toUpperCase()}
                      </span>
                      {q.moderation_category && (
                        <span className="text-[10px] font-bold tracking-widest text-neon-purple bg-neon-purple/10 px-2 py-0.5 border border-neon-purple/30 inline-flex items-center gap-1">
                          <Bot className="w-2.5 h-2.5" />{q.moderation_category}{q.moderation_score != null && ` · ${q.moderation_score}`}
                        </span>
                      )}
                      {q.report_count > 0 && (
                        <span className="text-[10px] font-bold tracking-widest text-neon-pink bg-neon-pink/10 px-2 py-0.5 border border-neon-pink/30 inline-flex items-center gap-1">
                          <Flag className="w-2.5 h-2.5" />{q.report_count} reports
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{new Date(q.hidden_at ?? q.created_at).toLocaleString()}</span>
                  </div>
                  {q.moderation_reason && (
                    <p className="text-[11px] italic text-neon-pink/80 mb-2">{q.moderation_reason}</p>
                  )}
                  <div className="mb-3 p-3 border-l-2 border-neon-purple/40 bg-secondary/30 rounded-sm">
                    {q.title && <p className="text-xs font-bold font-display mb-1">{q.title}</p>}
                    <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap break-words">{q.body}</p>
                    {q.author_name && <p className="text-[10px] text-muted-foreground mt-1.5">— {q.author_name}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {q.target_type === "thread" && (
                      <Link to="/forum/$threadId" params={{ threadId: q.target_id }} className="text-[11px] font-bold tracking-widest text-neon-purple hover:underline inline-flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />OPEN
                      </Link>
                    )}
                    {q.moderation_status !== "visible" && (
                      <button onClick={() => setStatus(q.target_type, q.target_id, "visible", "Mod restore")} className="px-3 py-1 text-[10px] font-bold tracking-widest border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10 transition-colors inline-flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" />RESTORE
                      </button>
                    )}
                    {q.moderation_status !== "hidden" && (
                      <button onClick={() => setStatus(q.target_type, q.target_id, "hidden", "Mod hide")} className="px-3 py-1 text-[10px] font-bold tracking-widest border border-neon-pink/40 text-neon-pink hover:bg-neon-pink/10 transition-colors inline-flex items-center gap-1">
                        <EyeOff className="w-3 h-3" />HIDE
                      </button>
                    )}
                    {q.moderation_status !== "removed" && (
                      <button onClick={() => setStatus(q.target_type, q.target_id, "removed", "Mod remove")} className="px-3 py-1 text-[10px] font-bold tracking-widest border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors inline-flex items-center gap-1">
                        <Trash2 className="w-3 h-3" />REMOVE
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === "reports" ? (
          reports.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No {filter === "pending" ? "pending " : ""}reports.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="glass-panel p-5">
                  <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 border ${
                        r.status === "pending" ? "border-neon-pink text-neon-pink" :
                        r.status === "reviewed" ? "border-neon-cyan text-neon-cyan" : "border-border text-muted-foreground"
                      }`}>{r.status.toUpperCase()}</span>
                      <span className="text-[10px] font-bold tracking-widest text-muted-foreground bg-secondary/50 px-2 py-0.5 border border-border">
                        {r.target_type.toUpperCase()}
                      </span>
                      {reportSnippets[r.target_id]?.status && reportSnippets[r.target_id].status !== "visible" && (
                        <span className="text-[10px] font-bold tracking-widest text-neon-pink bg-neon-pink/10 px-2 py-0.5 border border-neon-pink/30">
                          {(reportSnippets[r.target_id].status ?? "").toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-foreground mb-3"><span className="text-muted-foreground">Reason:</span> {r.reason}</p>
                  {reportSnippets[r.target_id] ? (
                    <div className="mb-3 p-3 border-l-2 border-neon-purple/40 bg-secondary/30 rounded-sm">
                      {reportSnippets[r.target_id].title && (
                        <p className="text-xs font-bold font-display mb-1">{reportSnippets[r.target_id].title}</p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap break-words">{reportSnippets[r.target_id].body}</p>
                      {reportSnippets[r.target_id].author && (
                        <p className="text-[10px] text-muted-foreground mt-1.5">— {reportSnippets[r.target_id].author}</p>
                      )}
                    </div>
                  ) : (
                    <div className="mb-3 p-3 border-l-2 border-destructive/40 bg-destructive/5 rounded-sm">
                      <p className="text-[11px] text-destructive italic">Original content was deleted or is unavailable.</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.target_type === "thread" && (
                      <Link to="/forum/$threadId" params={{ threadId: r.target_id }} className="text-[11px] font-bold tracking-widest text-neon-purple hover:underline inline-flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />OPEN
                      </Link>
                    )}
                    <button onClick={() => setStatus(r.target_type, r.target_id, "hidden", `Mod hide via report: ${r.reason.slice(0, 80)}`)} className="px-3 py-1 text-[10px] font-bold tracking-widest border border-neon-pink/40 text-neon-pink hover:bg-neon-pink/10 transition-colors inline-flex items-center gap-1">
                      <EyeOff className="w-3 h-3" />HIDE
                    </button>
                    <button onClick={() => setStatus(r.target_type, r.target_id, "removed", `Mod remove via report: ${r.reason.slice(0, 80)}`)} className="px-3 py-1 text-[10px] font-bold tracking-widest border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors inline-flex items-center gap-1">
                      <Trash2 className="w-3 h-3" />REMOVE
                    </button>
                    {r.status === "pending" && (
                      <button onClick={() => dismissReport(r.id)} className="px-3 py-1 text-[10px] font-bold tracking-widest border border-border text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                        <X className="w-3 h-3" />DISMISS REPORT
                      </button>
                    )}
                    <button onClick={() => deleteTarget(r)} className="ml-auto px-3 py-1 text-[10px] font-bold tracking-widest border border-destructive/60 text-destructive hover:bg-destructive/10 transition-colors inline-flex items-center gap-1">
                      <Trash2 className="w-3 h-3" />HARD DELETE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          log.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-sm">No moderation activity yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <div className="space-y-1.5 min-w-[640px]">
              {log.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-3 py-2 border border-border/40 bg-secondary/20 text-[11px] whitespace-nowrap">
                  <span className="text-[10px] font-bold tracking-widest text-neon-cyan w-16">{l.source.toUpperCase()}</span>
                  <span className="text-[10px] font-bold tracking-widest text-neon-purple w-20">{l.action.replace(/_/g, " ").toUpperCase()}</span>
                  <span className="text-muted-foreground w-20">{l.target_type}</span>
                  {l.category && <span className="text-neon-pink">{l.category}</span>}
                  {l.score != null && <span className="text-muted-foreground">· score {l.score}</span>}
                  <span className="flex-1 truncate text-foreground/80">{l.reason || ""}</span>
                  <Check className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
            </div>
          )
        )}
      </section>
    </div>
  );
}
