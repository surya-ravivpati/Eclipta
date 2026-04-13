import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpen, Target, Clock, Layers, FileText, Send, Check, AlertTriangle, Sparkles } from "lucide-react";

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

type ReviewStatus = "idle" | "reviewing" | "approved" | "rejected";

interface ReviewCheck {
  label: string;
  status: "pass" | "fail" | "pending";
  detail: string;
}

export function CourseBuilder() {
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

  const canProceed = () => {
    switch (step) {
      case 0: return topic.trim().length >= 3;
      case 1: return !!level;
      case 2: return !!structure;
      case 3: return !!depth && creatorReasoning.trim().length >= 10;
      default: return true;
    }
  };

  const simulateReview = () => {
    setReviewStatus("reviewing");
    const checks: ReviewCheck[] = [
      { label: "Topic Uniqueness", status: "pending", detail: "Checking if this topic is already well-covered..." },
      { label: "Structure Quality", status: "pending", detail: "Analyzing course structure..." },
      { label: "Creator Reasoning", status: "pending", detail: "Evaluating creator background..." },
      { label: "Content Depth", status: "pending", detail: "Verifying depth matches level..." },
    ];
    setReviewChecks(checks);

    checks.forEach((_, i) => {
      setTimeout(() => {
        setReviewChecks(prev => prev.map((c, j) =>
          j === i ? { ...c, status: Math.random() > 0.2 ? "pass" : "fail" as "pass" | "fail", detail: j === i ? getReviewDetail(j) : c.detail } : c
        ));
        if (i === checks.length - 1) {
          setTimeout(() => {
            setReviewStatus(prev => prev === "reviewing" ? "approved" : prev);
          }, 600);
        }
      }, 800 * (i + 1));
    });
  };

  const getReviewDetail = (index: number) => {
    const details = [
      `"${topic}" has low overlap with existing courses`,
      `${STRUCTURES.find(s => s.value === structure)?.label} structure is well-suited for this topic`,
      "Creator reasoning is clear and demonstrates relevant knowledge",
      `${DEPTHS.find(d => d.value === depth)?.label} depth is appropriate for ${level} level`,
    ];
    return details[index] || "";
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
                    onClick={simulateReview}
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
                        <p className="font-display font-bold tracking-wide">COURSE APPROVED</p>
                        <p className="text-sm text-muted-foreground mt-1">Your course is now live in the arena.</p>
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
