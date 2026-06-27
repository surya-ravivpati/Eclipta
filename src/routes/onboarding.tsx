import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, Sparkles, Target, Clock, Brain, User2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { containsProfanity } from "@/lib/profanity";
import { moderate, calmBlockMessage } from "@/lib/moderation";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome to Eclipta — Quick Setup" },
      { name: "description", content: "Five quick questions to personalize your learning arena." },
    ],
  }),
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("onboarded_at")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (profile?.onboarded_at) throw redirect({ to: "/" });
  },
  component: OnboardingPage,
});

/* ============= shape ============= */

type Form = {
  username: string;
  age: string;
  bio: string;
  goals: string[];
  hours: number | null;
  style: "hints" | "examples" | "challenge" | "";
};

const GOALS = [
  { id: "math",      label: "Math",        emoji: "📐" },
  { id: "languages", label: "Languages",   emoji: "🗣️" },
  { id: "science",   label: "Science",     emoji: "🔬" },
  { id: "coding",    label: "Coding",      emoji: "💻" },
  { id: "history",   label: "History",     emoji: "📜" },
  { id: "custom",    label: "Something else", emoji: "✨" },
] as const;

const HOURS = [
  { value: 2,  label: "Casual",  desc: "1–2 hrs / week" },
  { value: 5,  label: "Steady",  desc: "3–5 hrs / week" },
  { value: 10, label: "Focused", desc: "6–10 hrs / week" },
  { value: 15, label: "Intense", desc: "10+ hrs / week" },
] as const;

const STYLES = [
  { id: "hints",     icon: Brain,    title: "Hints first",   desc: "Luna nudges you toward answers, never spoils them." },
  { id: "examples",  icon: Sparkles, title: "Show examples", desc: "Walked-through worked solutions before you try." },
  { id: "challenge", icon: Target,   title: "Challenge me",  desc: "Skip the hand-holding. Hit me with the problem." },
] as const;

/* ============= component ============= */

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>({
    username: "",
    age: "",
    bio: "",
    goals: [],
    hours: null,
    style: "",
  });

  // Prefill username from email handle when available
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const handle = data.user?.email?.split("@")[0]?.replace(/[^a-z0-9_]/gi, "").slice(0, 20);
      if (handle) setForm((f) => (f.username ? f : { ...f, username: handle }));
    });
  }, []);

  const steps = useMemo(
    () => [
      { id: "identity",   title: "Pick your handle",       sub: "How you'll show up in the arena." },
      { id: "about",      title: "Tell us a bit about you", sub: "Just the basics. You can edit anytime." },
      { id: "goal",       title: "What do you want to learn?", sub: "Pick everything that interests you — we'll tune your roadmap." },
      { id: "hours",      title: "How much time do you have?", sub: "Sets a realistic weekly pace." },
      { id: "style",      title: "How should Luna teach you?", sub: "She'll adapt over time — this is the starting point." },
    ],
    [],
  );

  const total = steps.length;

  /* ============= validation per step ============= */

  const canAdvance = (() => {
    switch (step) {
      case 0: {
        const u = form.username.trim();
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(u)) return false;
        // Block obvious slurs / profanity in handles.
        return !containsProfanity(u);
      }
      case 1: {
        const age = parseInt(form.age, 10);
        return Number.isFinite(age) && age >= 6 && age <= 120 && form.bio.trim().length <= 240;
      }
      case 2: return form.goals.length > 0;
      case 3: return form.hours !== null;
      case 4: return !!form.style;
      default: return false;
    }
  })();

  /* ============= submit ============= */

  const handleFinish = async () => {
    if (!canAdvance) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // Unified moderation — usernames go through the same pipeline (deterministic
      // layer weighted heavily; impersonation of staff is blocked here too).
      const modVerdict = await moderate(form.username.trim(), "username");
      if (modVerdict.blocked) {
        toast.error(calmBlockMessage(modVerdict.category));
        setStep(0);
        return;
      }

      // DB check constraint allows only: 'theory' | 'practice' | 'mixed'
      const styleMap: Record<string, "theory" | "practice" | "mixed"> = {
        hints: "mixed",
        examples: "theory",
        challenge: "practice",
      };

      const { error } = await supabase
        .from("user_profiles")
        .update({
          username: form.username.trim(),
          bio: form.bio.trim() || null,
          age: parseInt(form.age, 10),
          learning_goal: form.goals.join(","),
          weekly_hours: form.hours,
          preferred_style: styleMap[form.style] ?? "mixed",
          onboarded_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error) {
        if (error.code === "23505") {
          toast.error("That handle is already taken — try another.");
          setStep(0);
          return;
        }
        throw error;
      }

      toast.success("You're in. Welcome to the arena. 🌙");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!canAdvance) return;
    if (step === total - 1) handleFinish();
    else setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  /* ============= render ============= */

  return (
    <div className="min-h-screen bg-background text-foreground antialiased relative overflow-hidden">
      {/* ambient glow */}
      <div className="absolute top-[-20%] right-[-10%] w-[36rem] h-[36rem] bg-neon-purple/8 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-10%] w-[28rem] h-[28rem] bg-neon-pink/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="relative max-w-xl mx-auto px-6 pt-16 pb-12">
        {/* progress */}
        <div className="flex items-center gap-2 mb-10">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < step ? "bg-neon-purple" : i === step ? "bg-neon-pink" : "bg-border"
              }`}
            />
          ))}
        </div>

        <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-neon-pink mb-3">
          Step {step + 1} of {total}
        </p>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
          >
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-2">
              {steps[step].title}
            </h1>
            <p className="text-muted-foreground text-sm mb-8">{steps[step].sub}</p>

            {/* ============= step bodies ============= */}

            {step === 0 && (
              <div className="space-y-3">
                <div className="relative">
                  <User2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    autoFocus
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="your_handle"
                    maxLength={20}
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-secondary/30 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-neon-purple/50"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  3–20 chars. Letters, numbers, underscores. Visible on your profile.
                </p>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                    Age
                  </label>
                  <input
                    autoFocus
                    type="number"
                    min={6}
                    max={120}
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                    placeholder="e.g. 17"
                    className="w-32 px-4 py-3 rounded-lg bg-secondary/30 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-neon-purple/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                    Short bio <span className="text-muted-foreground/60 normal-case font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    placeholder="A line about you — interests, goals, anything."
                    rows={3}
                    maxLength={240}
                    className="w-full px-4 py-3 rounded-lg bg-secondary/30 border border-border text-foreground placeholder:text-muted-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neon-purple/50"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1 text-right">{form.bio.length}/240</p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-2 gap-3">
                {GOALS.map((g) => {
                  const active = form.goals.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          goals: active
                            ? form.goals.filter((x) => x !== g.id)
                            : [...form.goals, g.id],
                        })
                      }
                      style={
                        active
                          ? {
                              background: "oklch(0.58 0.17 252 / 18%)",
                              borderColor: "oklch(0.58 0.17 252)",
                              boxShadow:
                                "0 0 0 2px oklch(0.58 0.17 252), 0 0 24px oklch(0.58 0.17 252 / 45%)",
                            }
                          : undefined
                      }
                      className="p-4 text-left glass-panel transition-all rounded-md hover:border-neon-purple/60"
                    >
                      <div className="text-2xl mb-2">{g.emoji}</div>
                      <div className="font-bold text-sm">{g.label}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {HOURS.map((h) => {
                  const active = form.hours === h.value;
                  return (
                    <button
                      key={h.value}
                      type="button"
                      onClick={() => setForm({ ...form, hours: h.value })}
                      style={
                        active
                          ? {
                              background: "oklch(0.58 0.17 252 / 18%)",
                              borderColor: "oklch(0.58 0.17 252)",
                              boxShadow:
                                "0 0 0 2px oklch(0.58 0.17 252), 0 0 24px oklch(0.58 0.17 252 / 45%)",
                            }
                          : undefined
                      }
                      className="p-4 text-left glass-panel transition-all rounded-md flex items-center gap-3 hover:border-neon-purple/60"
                    >
                      <Clock className={`w-5 h-5 ${active ? "text-neon-purple" : "text-muted-foreground"}`} />
                      <div>
                        <div className="font-bold text-sm">{h.label}</div>
                        <div className="text-xs text-muted-foreground">{h.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                {STYLES.map((s) => {
                  const active = form.style === s.id;
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setForm({ ...form, style: s.id })}
                      style={
                        active
                          ? {
                              background: "oklch(0.58 0.17 252 / 18%)",
                              borderColor: "oklch(0.58 0.17 252)",
                              boxShadow:
                                "0 0 0 2px oklch(0.58 0.17 252), 0 0 24px oklch(0.58 0.17 252 / 45%)",
                            }
                          : undefined
                      }
                      className="w-full p-4 text-left glass-panel transition-all rounded-md flex items-start gap-4 hover:border-neon-purple/60"
                    >
                      <div className={`w-10 h-10 shrink-0 border flex items-center justify-center ${
                        active ? "border-neon-purple bg-neon-purple/15" : "border-border bg-secondary/30"
                      }`}>
                        <Icon className={`w-5 h-5 ${active ? "text-neon-purple" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-sm mb-1">{s.title}</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">{s.desc}</div>
                      </div>
                      {active && <Check className="w-4 h-4 text-neon-purple shrink-0 mt-1" />}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* nav */}
        <div className="flex items-center justify-between mt-10">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="px-4 py-3 text-sm font-bold tracking-widest uppercase text-muted-foreground hover:text-foreground disabled:opacity-30 inline-flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance || saving}
            className="px-6 py-3 bg-neon-pink text-foreground font-bold text-sm tracking-widest uppercase inline-flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 neon-glow-pink"
          >
            {saving ? "Saving…" : step === total - 1 ? "Enter the arena" : "Continue"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-6 text-[11px] text-center text-muted-foreground">
          Required once. Edit any of this later from your profile.
        </p>
      </div>
    </div>
  );
}