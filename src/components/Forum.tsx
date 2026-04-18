import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, ThumbsUp, ThumbsDown, Award, Search, Filter, Users, BookOpen, ChevronUp, ChevronDown, Star, Clock, MessageCircle } from "lucide-react";

type Thread = {
  id: string;
  title: string;
  author: string;
  authorRank: string;
  course: string;
  votes: number;
  answers: number;
  views: number;
  tags: string[];
  timestamp: string;
  preview: string;
  solved: boolean;
};

const SAMPLE_THREADS: Thread[] = [
  {
    id: "1",
    title: "Why does dynamic programming feel impossible at first?",
    author: "nova_coder",
    authorRank: "Diamond",
    course: "FAANG Interview Prep",
    votes: 142,
    answers: 23,
    views: 1840,
    tags: ["algorithms", "dp", "mindset"],
    timestamp: "2h ago",
    preview: "I've been grinding DP problems for weeks and it feels like I'm not making progress. Then suddenly something clicked when I started drawing state transition diagrams...",
    solved: true,
  },
  {
    id: "2",
    title: "Best resources for understanding backpropagation intuitively?",
    author: "ml_wanderer",
    authorRank: "Platinum",
    course: "Machine Learning Foundations",
    votes: 89,
    answers: 15,
    views: 920,
    tags: ["neural-networks", "calculus", "resources"],
    timestamp: "5h ago",
    preview: "I understand the math but I can't visualize what's actually happening in the network. Looking for visual or interactive explanations...",
    solved: false,
  },
  {
    id: "3",
    title: "How do you actually stay consistent with daily practice?",
    author: "steady_learner",
    authorRank: "Gold",
    course: "General",
    votes: 234,
    answers: 47,
    views: 3200,
    tags: ["habits", "motivation", "strategy"],
    timestamp: "12h ago",
    preview: "I start strong every week then fall off by Wednesday. What systems do you use to keep the streak alive without burning out?",
    solved: true,
  },
  {
    id: "4",
    title: "Capture The Flag: SQL injection on level 7 — stuck",
    author: "h4ck_the_planet",
    authorRank: "Diamond",
    course: "Cybersecurity Fundamentals",
    votes: 67,
    answers: 8,
    views: 540,
    tags: ["ctf", "sql-injection", "challenge"],
    timestamp: "1d ago",
    preview: "The filter seems to block UNION SELECT but I suspect there's a bypass using encoding. Has anyone gotten past this without the hint system?",
    solved: false,
  },
  {
    id: "5",
    title: "Study group forming: System Design weekly sessions",
    author: "architect_99",
    authorRank: "Platinum",
    course: "System Design",
    votes: 178,
    answers: 31,
    views: 2100,
    tags: ["study-group", "system-design", "collaboration"],
    timestamp: "1d ago",
    preview: "Starting a weekly group where we design a system live, critique each other's approaches, and share feedback. Looking for 4-6 committed members...",
    solved: false,
  },
];

const COURSES_FILTER = ["All Courses", "FAANG Interview Prep", "Machine Learning Foundations", "Cybersecurity Fundamentals", "System Design", "General"];

const rankColors: Record<string, string> = {
  Diamond: "text-neon-cyan",
  Platinum: "text-neon-purple",
  Gold: "text-neon-pink",
  Silver: "text-muted-foreground",
};

function ThreadCard({ thread }: { thread: Thread }) {
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  const [voteCount, setVoteCount] = useState(thread.votes);
  const [expanded, setExpanded] = useState(false);

  const handleVote = (e: React.MouseEvent, dir: "up" | "down") => {
    e.stopPropagation();
    if (voted === dir) {
      setVoted(null);
      setVoteCount(thread.votes);
    } else {
      setVoted(dir);
      setVoteCount(thread.votes + (dir === "up" ? 1 : -1));
    }
  };

  return (
    <motion.div
      className="glass-panel p-5 hover:border-neon-purple/40 transition-colors group cursor-pointer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => setExpanded((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
      aria-expanded={expanded}
    >
      <div className="flex gap-4">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <button
            onClick={(e) => handleVote(e, "up")}
            className={`p-1 transition-colors ${voted === "up" ? "text-neon-purple" : "text-muted-foreground hover:text-foreground"}`}
            aria-label="Upvote"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
          <span className={`text-sm font-bold font-display ${voteCount > 0 ? "text-neon-purple" : "text-muted-foreground"}`}>
            {voteCount}
          </span>
          <button
            onClick={(e) => handleVote(e, "down")}
            className={`p-1 transition-colors ${voted === "down" ? "text-neon-pink" : "text-muted-foreground hover:text-foreground"}`}
            aria-label="Downvote"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="font-bold font-display text-base tracking-tight group-hover:text-neon-purple transition-colors leading-snug">
              {thread.solved && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 px-2 py-0.5 mr-2 align-middle">
                  SOLVED
                </span>
              )}
              {thread.title}
            </h3>
          </div>

          <p className={`text-xs text-muted-foreground leading-relaxed mb-3 ${expanded ? "" : "line-clamp-2"}`}>
            {thread.preview}
          </p>

          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground bg-secondary/50 px-2 py-0.5 border border-border">
              {thread.course}
            </span>
            {thread.tags.map(tag => (
              <span key={tag} className="text-[10px] text-muted-foreground">#{tag}</span>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className={rankColors[thread.authorRank] || "text-muted-foreground"}>●</span>
              <span className="font-medium text-foreground">{thread.author}</span>
              <span className={`${rankColors[thread.authorRank]} font-bold`}>{thread.authorRank}</span>
            </span>
            <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{thread.answers}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{thread.timestamp}</span>
            <span>{thread.views.toLocaleString()} views</span>
          </div>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mt-4 pt-4 border-t border-border"
              >
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  Full discussion threads with answers, voting, and replies are coming soon. Sign up to be notified
                  when threading goes live.
                </p>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="px-4 py-2 text-[10px] font-bold tracking-widest border border-neon-purple/30 text-neon-purple hover:bg-neon-purple/10 transition-colors"
                >
                  WRITE AN ANSWER (COMING SOON)
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

export function Forum() {
  const [selectedCourse, setSelectedCourse] = useState("All Courses");
  const [sortBy, setSortBy] = useState<"votes" | "recent" | "answers">("votes");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = SAMPLE_THREADS
    .filter(t => selectedCourse === "All Courses" || t.course === selectedCourse)
    .filter(t => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.tags.some(tag => tag.includes(searchQuery.toLowerCase())))
    .sort((a, b) => {
      if (sortBy === "votes") return b.votes - a.votes;
      if (sortBy === "answers") return b.answers - a.answers;
      return 0;
    });

  return (
    <section className="min-h-screen pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-neon-pink/30 bg-neon-pink/10 text-neon-pink text-xs font-bold tracking-widest mb-6">
            <Users className="w-3 h-3" />
            COMMUNITY
          </div>
          <h1 className="text-5xl md:text-6xl font-bold font-display tracking-tight mb-4">
            The{" "}
            <span className="text-neon-pink">
              Forum
            </span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Ask questions, share insights, and learn from the community. The best answers rise to the top.
          </p>
        </motion.div>

        {/* Filters */}
        <motion.div
          className="flex flex-col md:flex-row gap-3 mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search threads, tags..."
              className="w-full bg-secondary/30 border border-input pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple"
            />
          </div>
          <div className="flex gap-2">
            {COURSES_FILTER.slice(0, 4).map(course => (
              <button
                key={course}
                onClick={() => setSelectedCourse(course)}
                className={`px-3 py-2 text-[10px] font-bold tracking-widest border transition-colors ${
                  selectedCourse === course
                    ? "border-neon-purple bg-neon-purple/10 text-neon-purple"
                    : "border-border text-muted-foreground hover:border-neon-purple/40"
                }`}
              >
                {course === "All Courses" ? "ALL" : course.split(" ")[0].toUpperCase()}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Sort */}
        <div className="flex items-center gap-4 mb-6 text-[10px] font-bold tracking-widest text-muted-foreground">
          <span>SORT BY:</span>
          {(["votes", "recent", "answers"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`transition-colors ${sortBy === s ? "text-neon-purple" : "hover:text-foreground"}`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Threads */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map(thread => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No threads found. Try a different filter.</p>
            </div>
          )}
        </div>

        {/* Messaging & Tutoring callout */}
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
    </section>
  );
}
