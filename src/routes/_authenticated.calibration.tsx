import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowRight, Lightbulb, Check, Brain, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  CALIBRATION_STEPS,
  CALIBRATION_QUESTION_COUNT,
  inferProfile,
  describeProfile,
  type CalibrationResponse,
  type Confidence,
  type LearningProfile,
} from "@/lib/luna-calibration";

export const Route = createFileRoute("/_authenticated/calibration")({
  head: () => ({
    meta: [
      { title: "Calibrate Luna – Eclipta" },
      { name: "description", content: "A short diagnostic that tunes Luna to how you actually learn best." },
    ],
  }),
  component: CalibrationPage,
});

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  1: "Guessing",
  2: "Not sure",
  3: "Fairly sure",
  4: "Certain",
};

function CalibrationPage() {
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const [responses, setResponses] = useState<CalibrationResponse[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [usedHint, setUsedHint] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const shownAt = useRef<number>(Date.now());

  const step = CALIBRATION_STEPS[stepIdx];
  const done = stepIdx >= CALIBRATION_STEPS.length;

  // Reset the per-step state + timer whenever the step changes.
  useEffect(() => {
    setSelected(null);
    setConfidence(null);
    setUsedHint(false);
    shownAt.current = Date.now();
  }, [stepIdx]);

  const questionsSoFar = useMemo(
    () => CALIBRATION_STEPS.slice(0, stepIdx).filter((s) => s.kind === "question").length,
    [stepIdx],
  );

  const finish = async (all: CalibrationResponse[]) => {
    const result = inferProfile(all);
    setProfile(result);
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // learner_profile + calibration_runs are added in the learner-profile
        // migration; types aren't regenerated yet, hence the casts.
        await supabase.from("user_profiles")
          .update({ learner_profile: result } as never)
          .eq("user_id", user.id);
        await supabase.from("calibration_runs" as never)
          .insert({ user_id: user.id, profile: result, responses: all } as never);
      }
    } catch (e) {
      console.error("calibration save failed", e);
      toast.error("Saved your profile locally, but syncing hit a snag.");
    } finally {
      setSaving(false);
    }
  };

  const record = (r: CalibrationResponse, advance = true) => {
    const all = [...responses, r];
    setResponses(all);
    if (stepIdx + 1 >= CALIBRATION_STEPS.length) {
      void finish(all);
      setStepIdx(stepIdx + 1);
    } else if (advance) {
      setStepIdx(stepIdx + 1);
    }
  };

  const submitAnswer = () => {
    if (step?.kind !== "question" || selected === null || confidence === null) return;
    record({
      itemId: step.item.id,
      role: step.item.role,
      correct: selected === step.item.correctIndex,
      ms: Date.now() - shownAt.current,
      confidence,
      action: usedHint ? "hint" : "answered",
    });
  };

  const skipStruggle = () => {
    if (step?.kind !== "question") return;
    record({
      itemId: step.item.id,
      role: step.item.role,
      correct: false,
      ms: Date.now() - shownAt.current,
      confidence: confidence ?? 1,
      action: "skipped",
    });
  };

  const advanceTeach = () => setStepIdx(stepIdx + 1);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <section className="max-w-2xl mx-auto px-6 pt-28 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-md bg-neon-purple/10 border border-neon-purple/40 grid place-items-center">
            <Brain className="w-4 h-4 text-neon-purple" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg leading-tight">Calibrate Luna</h1>
            <p className="text-xs text-muted-foreground">A 5-minute read on how you learn best. Not graded.</p>
          </div>
        </div>

        {/* Progress */}
        {!done && (
          <div className="mb-8">
            <div className="h-1 rounded-full bg-secondary/40 overflow-hidden">
              <motion.div
                className="h-full bg-neon-purple"
                initial={false}
                animate={{ width: `${(questionsSoFar / CALIBRATION_QUESTION_COUNT) * 100}%` }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <p className="text-[10px] font-mono tracking-widest text-muted-foreground mt-2 uppercase">
              {Math.min(questionsSoFar + (step?.kind === "question" ? 1 : 0), CALIBRATION_QUESTION_COUNT)} / {CALIBRATION_QUESTION_COUNT}
            </p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ── Teach step ─────────────────────────────────────────── */}
          {!done && step?.kind === "teach" && (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
              className="glass-panel p-7 border border-neon-cyan/20"
            >
              <p className="text-[10px] font-bold tracking-widest text-neon-cyan mb-3 uppercase">Learn this first</p>
              <h2 className="font-display font-bold text-xl mb-4">{step.title}</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{step.body}</p>
              <button
                onClick={advanceTeach}
                className="mt-7 inline-flex items-center gap-2 px-5 py-2.5 bg-neon-cyan/10 border border-neon-cyan/40 text-neon-cyan text-xs font-bold tracking-widest hover:bg-neon-cyan/20 transition-colors"
              >
                GOT IT <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}

          {/* ── Question step ──────────────────────────────────────── */}
          {!done && step?.kind === "question" && (
            <motion.div
              key={step.item.id}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
              className="glass-panel p-7 border border-border"
            >
              <h2 className="font-display font-semibold text-lg leading-snug mb-5">{step.item.prompt}</h2>

              <div className="space-y-2.5 mb-6">
                {step.item.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setSelected(i)}
                    className={`w-full text-left px-4 py-3 border text-sm transition-colors ${
                      selected === i
                        ? "border-neon-purple bg-neon-purple/10 text-foreground"
                        : "border-border hover:border-neon-purple/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground mr-3">{String.fromCharCode(65 + i)}</span>
                    {opt}
                  </button>
                ))}
              </div>

              {/* Hint (struggle item only) */}
              {step.item.allowHint && (
                <div className="mb-6">
                  {usedHint ? (
                    <p className="text-sm text-neon-cyan/90 flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" />{step.item.hint}
                    </p>
                  ) : (
                    <button
                      onClick={() => setUsedHint(true)}
                      className="inline-flex items-center gap-2 text-xs text-neon-cyan hover:underline"
                    >
                      <Lightbulb className="w-3.5 h-3.5" /> Show me a hint
                    </button>
                  )}
                </div>
              )}

              {/* Confidence */}
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground mb-2 uppercase">
                How sure are you?
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-7">
                {([1, 2, 3, 4] as Confidence[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setConfidence(c)}
                    className={`py-2 text-[11px] font-bold tracking-wide border transition-colors ${
                      confidence === c
                        ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan"
                        : "border-border text-muted-foreground hover:border-neon-cyan/40"
                    }`}
                  >
                    {CONFIDENCE_LABELS[c]}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3">
                {step.item.allowHint ? (
                  <button onClick={skipStruggle} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <SkipForward className="w-3.5 h-3.5" /> Skip this one
                  </button>
                ) : <span />}
                <button
                  onClick={submitAnswer}
                  disabled={selected === null || confidence === null}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-neon-purple text-primary-foreground text-xs font-bold tracking-widest hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  CONTINUE <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Result ─────────────────────────────────────────────── */}
          {done && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-full bg-neon-cyan/10 border border-neon-cyan/40 grid place-items-center mx-auto mb-4">
                  {saving ? <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" /> : <Check className="w-5 h-5 text-neon-cyan" />}
                </div>
                <h2 className="font-display font-bold text-2xl mb-2">Luna's tuned to you</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Here's what the diagnostic read. Luna uses this to decide how to guide you — and it keeps adjusting as you learn.
                </p>
              </div>

              {profile && (
                <div className="space-y-3 mb-9">
                  {describeProfile(profile).map((row) => (
                    <div key={row.label} className="glass-panel p-4 border border-border">
                      <p className="text-[10px] font-bold tracking-widest text-neon-purple uppercase mb-1">{row.label}</p>
                      <p className="text-sm text-foreground">{row.value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 justify-center flex-wrap">
                <button
                  onClick={() => navigate({ to: "/battles" })}
                  className="px-6 py-3 bg-neon-pink text-primary-foreground text-xs font-bold tracking-widest hover:opacity-90 transition-opacity"
                >
                  START LEARNING
                </button>
                <Link to="/profile" className="px-6 py-3 border border-border text-xs font-bold tracking-widest hover:border-neon-purple transition-colors">
                  VIEW PROFILE
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
