import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircle, Loader2, Flag, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ReportDialog } from "./ReportDialog";

type Comment = {
  id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function AuthorLink({ name }: { name: string }) {
  const isUsername = /^[a-zA-Z0-9_]{3,20}$/.test(name);
  if (!isUsername) return <span className="font-medium text-foreground">{name}</span>;
  return (
    <Link to="/u/$username" params={{ username: name }} className="font-medium hover:text-neon-purple transition-colors">
      {name}
    </Link>
  );
}

export function AnswerComments({ answerId, isModerator }: { answerId: string; isModerator: boolean }) {
  const { user, isAuthenticated } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("forum_comments")
      .select("id,user_id,author_name,body,created_at")
      .eq("answer_id", answerId)
      .order("created_at", { ascending: true });
    setComments((data as Comment[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [answerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Sign in to comment");
    if (reply.trim().length < 2) return toast.error("Comment too short");
    setSubmitting(true);
    const { data: prof } = await supabase.from("user_profiles").select("username").eq("user_id", user.id).maybeSingle();
    const author_name = prof?.username || user.email?.split("@")[0] || "Learner";
    const { error } = await supabase.from("forum_comments").insert({
      answer_id: answerId, user_id: user.id, author_name, body: reply.trim().slice(0, 1000),
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setReply("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("forum_comments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Comment removed");
    load();
  };

  return (
    <div className="mt-3 pl-4 border-l border-border/50">
      <div className="text-[11px] font-bold tracking-widest text-muted-foreground inline-flex items-center gap-1 mb-2">
        <MessageCircle className="w-3 h-3" />
        {comments.length === 0 ? "COMMENTS" : `${comments.length} ${comments.length === 1 ? "COMMENT" : "COMMENTS"}`}
      </div>

      <div className="space-y-2">
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin text-neon-purple" />
        ) : (
          comments.map((c) => (
            <div key={c.id} className="text-xs py-1.5 border-b border-border/30 last:border-0">
              <p className="text-foreground/90 leading-snug whitespace-pre-wrap">{c.body}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                <AuthorLink name={c.author_name} />
                <span>· {timeAgo(c.created_at)}</span>
                {isAuthenticated && user?.id !== c.user_id && (
                  <button
                    onClick={() => setReporting(c.id)}
                    className="text-muted-foreground hover:text-neon-pink inline-flex items-center gap-0.5"
                    title="Report comment"
                  >
                    <Flag className="w-2.5 h-2.5" />
                  </button>
                )}
                {(user?.id === c.user_id || isModerator) && (
                  <button
                    onClick={() => remove(c.id)}
                    className="text-muted-foreground hover:text-destructive inline-flex items-center gap-0.5"
                    title="Delete comment"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {isAuthenticated ? (
          <form onSubmit={submit} className="flex gap-2 pt-1">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={1000}
              placeholder="Add a comment…"
              className="flex-1 bg-secondary/30 border border-input px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-neon-purple"
            />
            <button
              type="submit"
              disabled={submitting || reply.trim().length < 2}
              className="px-3 py-1 text-[10px] font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              POST
            </button>
          </form>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">Sign in to comment.</p>
        )}
      </div>

      {reporting && (
        <ReportDialog
          open={!!reporting}
          onClose={() => setReporting(null)}
          targetType="comment"
          targetId={reporting}
        />
      )}
    </div>
  );
}
