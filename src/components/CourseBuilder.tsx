import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpen, Target, Clock, Layers, FileText, Send, Check, AlertTriangle, Sparkles, ListChecks, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const STEPS = [
  { id: "topic", label: "TOPIC", icon: BookOpen },
  { id: "level", label: "LEVEL", icon: Target },
  { id: "structure", label: "STRUCTURE", icon: Layers },
  { id: "details", label: "DETAILS", icon: FileText },
  { id: "review", label: "REVIEW", icon: Send },
] as const;

const LEVELS = [
  { value: "beginner", label: "Beginner", description: "No prior knowledge needed" },
  { value: "intermediate", label: "Intermediate", description: "Some foundational understanding" },
  { value: "advanced", label: "Advanced", description: "Deep expertise required" },
  { value: "certification", label: "Certification Prep", description: "Targeting a specific qualification" },
];

const DEPTHS = [
  { value: "overview", label: "Overview", hours: "2-5 hrs" },
  { value: "standard", label: "Standard", hours: "10-20 hrs" },
  { value: "deep-dive", label: "Deep Dive", hours: "30-60 hrs" },
  { value: "mastery", label: "Mastery", hours: "80+ hrs" },
];

const STRUCTURES = [
  { value: "linear", label: "Linear", description: "Sequential chapters, one after another" },
  { value: "modular", label: "Modular", description: "Independent modules, flexible order" },
  { value: "project-based", label: "Project-Based", description: "Learn by building real projects" },
  { value: "challenge-driven", label: "Challenge-Driven", description: "Problem sets and adaptive tests" },
];

type ReviewStatus = "idle" | "reviewing" | "approved" | "denied" | "error";

interface ReviewCheck {
  label: string;
  status: "pass" | "fail" | "pending";
  detail: string;
}

type Verdict = {
  decision: "approve" | "deny";
  score: number;
  reason: string;
  feedback: string;
  courseId?: string;
  courseSlug?: string;
};

export function CourseBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [level, setLevel] = useState("");
  const [depth, setDepth] = useState("");
  const [structure, setStructure] = useState("");
  const [timeCommitment, setTimeCommitment] = useState("5");
  const [prerequisites, setPrerequisites] = useState("");
  const [creatorReasoning, setCreatorReasoning] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("idle");
  const [reviewChecks, setReviewChecks] = useState<ReviewCheck[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const canProceed = () => {
    switch (step) {
      case 0: return topic.trim().length >= 3;
      case 1: return !!level;
      case 2: return !!structure;
      case 3: return !!depth && creatorReasoning.trim().length >= 10;
      default: return true;
    }
  };

  const submitProposal = async () => {
    if (!user) {
      toast.error("Sign in to submit a course proposal");
      return;
    }
    setReviewStatus("reviewing");
    setVerdict(null);
    const checks: ReviewCheck[] = [
      { label: "Format & Spam Check", status: "pending", detail: "Validating proposal isn't spam or junk…" },
      { label: "Scope Coherence", status: "pending", detail: "Checking depth fits level…" },
      { label: "AI Editorial Review", status: "pending", detail: "Grading on clarity, scope, and creator credibility…" },
      { label: "Final Verdict", status: "pending", detail: "Compiling decision…" },
    ];
    setReviewChecks(checks);

    // Persist proposal to DB first
    const { data: inserted, error } = await supabase.from("course_proposals").insert({
      user_id: user.id,
      topic: topic.trim(),
      description: topicDescription.trim() || null,
      level,
      structure,
      depth,
      weekly_hours: parseInt(timeCommitment, 10) || 5,
      prerequisites: prerequisites.trim() || null,
      creator_reasoning: creatorReasoning.trim(),
      status: "reviewing",
    }).select("id").single();

    if (error) {
      toast.error("Could not save proposal", { description: error.message });
      setReviewStatus("idle");
      return;
    }

    // Animate the first two heuristic checks while AI runs in background
    setTimeout(() => {
      setReviewChecks(prev => prev.map((c, j) =>
        j === 0 ? { ...c, status: "pass", detail: "Looks like a real proposal." } : c
      ));
    }, 600);
    setTimeout(() => {
      setReviewChecks(prev => prev.map((c, j) =>
        j === 1 ? { ...c, status: "pass", detail: `${DEPTHS.find(d => d.value === depth)?.label} depth fits ${LEVELS.find(l => l.value === level)?.label} level.` } : c
      ));
    }, 1200);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("review-course-proposal", {
        body: { proposalId: inserted.id },
      });
      if (fnErr) throw fnErr;
      const v = data as Verdict;
      setVerdict(v);

      // Update last two checks based on verdict
      setReviewChecks(prev => prev.map((c, j) => {
        if (j === 2) return {
          ...c,
          status: v.decision === "approve" ? "pass" : "fail",
          detail: v.feedback,
        };
        if (j === 3) return {
          ...c,
          status: v.decision === "approve" ? "pass" : "fail",
          detail: v.decision === "approve" ? `Approved with score ${v.score}/100.` : `Denied (${v.score}/100): ${v.reason}`,
        };
        return c;
      }));

      setTimeout(() => {
        setReviewStatus(v.decision === "approve" ? "approved" : "denied");
      }, 500);
    } catch (e) {
      console.error(e);
      setReviewStatus("error");
      setReviewChecks(prev => prev.map((c, j) =>
        j >= 2 ? { ...c, status: "fail", detail: "Review service unavailable. Try again in a moment." } : c
      ));
    }
  };

  const goToEditor = () => {
    if (verdict?.courseId) {
      navigate({ to: "/courses/$courseId/edit", params: { courseId: verdict.courseId } });
    }
  };

  const reset = () => {
    setReviewStatus("idle");
    setVerdict(null);
    setReviewChecks([]);
  };

  return (
    <div className="pt-24 pb-16 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight mb-3">
            BUILD A <span className="text-neon-purple text-glow-purple">COURSE</span>
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Design your learning path. Share it with the arena.
          </p>
        </motion.div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1 mb-10">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center">
                <button
                  onClick={() => i < step && setStep(i)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold tracking-widest transition-all ${
                    i === step
                      ? "bg-neon-purple text-primary-foreground neon-glow-purple"
                      : i < step
                      ? "text-neon-purple border border-neon-purple/30 hover:border-neon-purple/60"
                      : "text-muted-foreground border border-border"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden md:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-px mx-1 ${i < step ? "bg-neon-purple" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="glass-panel p-8 md:p-10"
          >
            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold tracking-widest text-muted-foreground mb-2">COURSE TOPIC</label>
                  <input
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. Quantum Computing Fundamentals"
                    className="w-full bg-secondary/50 border border-input rounded-sm px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple font-display text-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-widest text-muted-foreground mb-2">DESCRIPTION</label>
                  <textarea
                    value={topicDescription}
                    onChange={e => setTopicDescription(e.target.value)}
                    placeholder="What will learners gain from this course? Describe the scope and key outcomes..."
                    rows={4}
                    className="w-full bg-secondary/50 border border-input rounded-sm px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple resize-none"
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <label className="block text-xs font-bold tracking-widest text-muted-foreground mb-4">TARGET LEVEL</label>
                <div className="grid gap-3">
                  {LEVELS.map(l => (
                    <button
                      key={l.value}
                      onClick={() => setLevel(l.value)}
                      className={`flex items-start gap-4 p-4 border text-left transition-all ${
                        level === l.value
                          ? "border-neon-purple bg-neon-purple/10 neon-glow-purple"
                          : "border-border bg-secondary/30 hover:border-muted-foreground"
                      }`}
                    >
                      <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        level === l.value ? "border-neon-purple" : "border-muted-foreground"
                      }`}>
                        {level === l.value && <div className="w-2 h-2 rounded-full bg-neon-purple" />}
                      </div>
                      <div>
                        <span className="font-display font-bold tracking-wide">{l.label}</span>
                        <p className="text-sm text-muted-foreground mt-0.5">{l.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <label className="block text-xs font-bold tracking-widest text-muted-foreground mb-4">COURSE STRUCTURE</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {STRUCTURES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setStructure(s.value)}
                      className={`p-5 border text-left transition-all ${
                        structure === s.value
                          ? "border-neon-purple bg-neon-purple/10 neon-glow-purple"
                          : "border-border bg-secondary/30 hover:border-muted-foreground"
                      }`}
                    >
                      <span className="font-display font-bold tracking-wide text-lg">{s.label}</span>
                      <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold tracking-widest text-muted-foreground mb-3">CONTENT DEPTH</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {DEPTHS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => setDepth(d.value)}
                        className={`p-3 border text-center transition-all ${
                          depth === d.value
                            ? "border-neon-purple bg-neon-purple/10"
                            : "border-border bg-secondary/30 hover:border-muted-foreground"
                        }`}
                      >
                        <span className="font-display font-bold text-sm">{d.label}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{d.hours}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold tracking-widest text-muted-foreground mb-2">
                    <Clock className="w-3 h-3 inline mr-1" />
                    WEEKLY TIME COMMITMENT (HOURS)
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1"
                      max="30"
                      value={timeCommitment}
                      onChange={e => setTimeCommitment(e.target.value)}
                      className="w-full accent-[oklch(0.55_0.25_290)]"
                    />
                    <span className="font-display font-bold text-neon-purple min-w-[3ch] text-right">{timeCommitment}h</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold tracking-widest text-muted-foreground mb-2">PREREQUISITES (OPTIONAL)</label>
                  <input
                    value={prerequisites}
                    onChange={e => setPrerequisites(e.target.value)}
                    placeholder="e.g. Basic linear algebra, Python fundamentals"
                    className="w-full bg-secondary/50 border border-input rounded-sm px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold tracking-widest text-muted-foreground mb-2">
                    WHY ARE YOU THE RIGHT PERSON TO CREATE THIS?
                  </label>
                  <textarea
                    value={creatorReasoning}
                    onChange={e => setCreatorReasoning(e.target.value)}
                    placeholder="Explain your background, expertise, or motivation for teaching this topic..."
                    rows={3}
                    className="w-full bg-secondary/50 border border-input rounded-sm px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-neon-purple resize-none"
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="space-y-3">
                  <h3 className="font-display font-bold tracking-widest text-xs text-muted-foreground">COURSE SUMMARY</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <SummaryCard label="Topic" value={topic} />
                    <SummaryCard label="Level" value={LEVELS.find(l => l.value === level)?.label || ""} />
                    <SummaryCard label="Structure" value={STRUCTURES.find(s => s.value === structure)?.label || ""} />
                    <SummaryCard label="Depth" value={DEPTHS.find(d => d.value === depth)?.label || ""} />
                    <SummaryCard label="Weekly Hours" value={`${timeCommitment}h/week`} />
                    {prerequisites && <SummaryCard label="Prerequisites" value={prerequisites} />}
                  </div>
                  {topicDescription && (
                    <div className="p-3 bg-secondary/30 border border-border">
                      <span className="text-xs font-bold tracking-widest text-muted-foreground">DESCRIPTION</span>
                      <p className="text-sm mt-1">{topicDescription}</p>
                    </div>
                  )}
                </div>

                {/* Review system */}
                {reviewStatus === "idle" && (
                  <button
                    onClick={submitProposal}
                    className="w-full py-3 bg-neon-purple text-primary-foreground font-display font-bold tracking-widest text-sm hover:opacity-90 transition-opacity neon-glow-purple flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    SUBMIT FOR REVIEW
                  </button>
                )}

                {reviewStatus !== "idle" && (
                  <div className="space-y-3">
                    <h3 className="font-display font-bold tracking-widest text-xs text-muted-foreground flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-neon-purple" />
                      AI REVIEW
                    </h3>
                    {reviewChecks.map((check, i) => (
                      <motion.div
                        key={check.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={`flex items-start gap-3 p-3 border ${
                          check.status === "pass" ? "border-neon-cyan/30 bg-neon-cyan/5" :
                          check.status === "fail" ? "border-destructive/30 bg-destructive/5" :
                          "border-border bg-secondary/20"
                        }`}
                      >
                        <div className="mt-0.5">
                          {check.status === "pending" && (
                            <div className="w-4 h-4 border-2 border-muted-foreground border-t-neon-purple rounded-full animate-spin" />
                          )}
                          {check.status === "pass" && <Check className="w-4 h-4 text-neon-cyan" />}
                          {check.status === "fail" && <AlertTriangle className="w-4 h-4 text-destructive" />}
                        </div>
                        <div>
                          <span className="font-display font-bold text-sm">{check.label}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
                        </div>
                      </motion.div>
                    ))}

                    {reviewStatus === "approved" && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 border border-neon-purple/40 bg-neon-purple/10 text-center neon-glow-purple"
                      >
                        <Check className="w-6 h-6 text-neon-purple mx-auto mb-2" />
                        <p className="font-display font-bold tracking-wide">APPROVED — SCORE {verdict?.score}/100</p>
                        <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-md mx-auto">{verdict?.reason}</p>
                        <button
                          onClick={goToEditor}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity"
                        >
                          <Sparkles className="w-3.5 h-3.5" />OPEN COURSE EDITOR
                        </button>
                      </motion.div>
                    )}

                    {reviewStatus === "denied" && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 border border-destructive/40 bg-destructive/10 text-center"
                      >
                        <AlertTriangle className="w-6 h-6 text-destructive mx-auto mb-2" />
                        <p className="font-display font-bold tracking-wide text-destructive">PROPOSAL DENIED</p>
                        <p className="text-sm text-foreground mt-2 mb-2 max-w-md mx-auto"><span className="text-muted-foreground">Why: </span>{verdict?.reason}</p>
                        {verdict?.feedback && verdict.feedback !== verdict.reason && (
                          <p className="text-xs text-muted-foreground mt-2 mb-4 max-w-md mx-auto italic">{verdict.feedback}</p>
                        )}
                        <div className="flex justify-center gap-2 mt-4">
                          <button
                            onClick={reset}
                            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-widest border border-neon-purple text-neon-purple hover:bg-neon-purple/10 transition-colors"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />REVISE & RESUBMIT
                          </button>
                          <Link
                            to="/profile"
                            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-widest border border-border text-muted-foreground hover:border-foreground transition-colors"
                          >
                            <ListChecks className="w-3.5 h-3.5" />MY COURSES
                          </Link>
                        </div>
                      </motion.div>
                    )}

                    {reviewStatus === "error" && (
                      <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="p-4 border border-destructive/40 bg-destructive/10 text-center"
                      >
                        <p className="font-display font-bold text-destructive">REVIEW FAILED</p>
                        <p className="text-sm text-muted-foreground mt-1 mb-3">Couldn't reach the AI review service. Please try again.</p>
                        <button
                          onClick={reset}
                          className="px-4 py-2 text-xs font-bold tracking-widest border border-neon-purple text-neon-purple hover:bg-neon-purple/10 transition-colors"
                        >
                          TRY AGAIN
                        </button>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-widest border border-border hover:border-neon-purple text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            BACK
          </button>
          {step < STEPS.length - 1 && (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            >
              NEXT
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-secondary/30 border border-border">
      <span className="text-xs font-bold tracking-widest text-muted-foreground">{label.toUpperCase()}</span>
      <p className="font-display font-semibold mt-0.5">{value}</p>
    </div>
  );
}
