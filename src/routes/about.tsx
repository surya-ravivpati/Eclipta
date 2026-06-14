import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import {
  Sparkles, Target, Swords, Trophy, Brain, Users, Mail, Github,
  MessageSquare, Send, CheckCircle2, Loader2, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./About.css";

// ─── Contact form ────────────────────────────────────────────────────
// Backed by submit_contact_message RPC (validates, rate-limits, runs through
// moderation, stores in contact_messages).

interface FieldErrors {
  name?: string;
  email?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    const n = name.trim(), e = email.trim(), m = message.trim();
    if (n.length < 2)             next.name    = "At least 2 characters.";
    else if (n.length > 80)       next.name    = "Keep it under 80 characters.";
    if (!EMAIL_RE.test(e))        next.email   = "Enter a valid email.";
    if (m.length < 10)            next.message = "Add a bit more detail (10+ characters).";
    else if (m.length > 4000)     next.message = "Trim it under 4000 characters.";
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("submit_contact_message" as any, {
        p_name:       name.trim(),
        p_email:      email.trim(),
        p_subject:    subject.trim() || null,
        p_message:    message.trim(),
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
      if (error) {
        toast.error(error.message || "Couldn't send — try again in a moment.");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((data as any)?.moderation_status === "hidden") {
        toast.message("Message received — held for review", {
          description: "We'll look at it shortly.",
        });
      } else {
        toast.success("Message sent — we usually reply within 48 hours.");
      }
      setSent(true);
      setName(""); setEmail(""); setSubject(""); setMessage("");
      setErrors({});
    } catch (err) {
      console.error("contact form submit failed", err);
      toast.error("Network hiccup — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="ab-panel-card" style={{ textAlign: "center" }}>
        <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--ab-accent)" }} />
        <h3 className="ab-serif" style={{ fontSize: 22, marginBottom: 8 }}>Message received</h3>
        <p style={{ fontSize: 14, color: "var(--ab-dim)", maxWidth: 360, margin: "0 auto 20px", lineHeight: 1.6 }}>
          Thanks for reaching out. We read everything that lands in the inbox
          and usually reply within 48 hours.
        </p>
        <button type="button" onClick={() => setSent(false)} className="ab-link" style={{ borderRadius: 6 }}>
          Send another
        </button>
      </div>
    );
  }

  const onBlur = (field: keyof FieldErrors) => () => {
    const v = validate();
    setErrors((prev) => ({ ...prev, [field]: v[field] }));
  };

  return (
    <form onSubmit={handleSubmit} className="ab-panel-card" noValidate>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <div className="ab-pillar-icon" style={{ marginBottom: 0 }}>
          <Mail className="w-4 h-4" />
        </div>
        <div>
          <h3 className="ab-serif" style={{ fontSize: 18, lineHeight: 1.1 }}>Send us a message</h3>
          <p style={{ fontSize: 11, color: "var(--ab-fog)", marginTop: 2 }}>Goes straight to the team inbox.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field
          label="Name" value={name} onChange={setName} maxLength={80}
          error={errors.name} onBlur={onBlur("name")}
          autoComplete="name" required
        />
        <Field
          label="Email" type="email" value={email} onChange={setEmail} maxLength={120}
          error={errors.email} onBlur={onBlur("email")}
          autoComplete="email" required
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <Field
          label="Subject" value={subject} onChange={setSubject} maxLength={120}
          placeholder="What's this about? (optional)"
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="ab-flabel">
          <span>Message <span className="req">*</span></span>
          <span style={{ color: message.length > 4000 ? "var(--ab-pink)" : "var(--ab-fog)" }}>
            {message.length}/4000
          </span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onBlur={onBlur("message")}
          rows={6}
          maxLength={4000}
          placeholder="How can we help? Feedback, questions, bug reports — all welcome."
          className={`ab-textarea${errors.message ? " is-error" : ""}`}
          required
        />
        {errors.message && (
          <p className="ab-ferror"><AlertCircle className="w-3 h-3" />{errors.message}</p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginTop: 20 }}>
        <p className="ab-fhint">
          By submitting, you agree we may reply to <span style={{ color: "var(--ab-dim)" }}>{email.trim() || "your email"}</span>.
        </p>
        <button type="submit" disabled={submitting} className="ab-btn ab-btn--accent">
          {submitting ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</>
          ) : (
            <><Send className="w-3.5 h-3.5" />Send message</>
          )}
        </button>
      </div>
    </form>
  );
}

function Field({
  label, value, onChange, type = "text", maxLength, placeholder, error, onBlur, autoComplete, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  maxLength?: number;
  placeholder?: string;
  error?: string;
  onBlur?: () => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="ab-flabel">
        <span>{label} {required && <span className="req">*</span>}</span>
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className={`ab-input${error ? " is-error" : ""}`}
      />
      {error && (
        <p className="ab-ferror"><AlertCircle className="w-3 h-3" />{error}</p>
      )}
    </div>
  );
}

// ─── Page content ────────────────────────────────────────────────────

const FOUNDERS = [
  {
    name: "Surya Ravipati",
    role: "Co-Founder · Engineering",
    bio: "Architect of Eclipta's adaptive learning engine and the arena that wraps it.",
    initials: "SR",
  },
  {
    name: "Aarit Perswal",
    role: "Co-Founder · Product",
    bio: "Builds the battle systems and gamified progression that make learning addictive.",
    initials: "AP",
  },
];

const PILLARS = [
  { icon: Brain,     title: "Adaptive AI",             desc: "Luna learns your pace, your weak spots, and the way you think — then meets you there." },
  { icon: Swords,    title: "Battles, not worksheets", desc: "Knowledge battles turn rote practice into competitive duels with real stakes." },
  { icon: Trophy,    title: "An expedition, not a ladder", desc: "Chart realms from the Observatory to the Eclipse — each unlocks new Ecliptars, caches, and story." },
  { icon: Target,    title: "Personalized mastery",    desc: "Adaptive tests and personalized courses target the exact skills you need next." },
  { icon: Users,     title: "Built for learners",      desc: "Forums, leaderboards, and community challenges keep momentum alive." },
  { icon: Sparkles,  title: "Designed to delight",     desc: "A cinematic arena aesthetic that makes you actually want to come back tomorrow." },
];

const STATS = [
  { value: "7",    label: "Archetypes" },
  { value: "8",    label: "Trophy tiers" },
  { value: "AI",   label: "Adaptive tutor" },
  { value: "24/7", label: "Live battles" },
];

// shared scroll-reveal — same easing + blur grammar as the homepage film
const EASE: [number, number, number, number] = [0.2, 0.7, 0.2, 1];
const reveal = {
  initial: { opacity: 0, y: 28, filter: "blur(10px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.9, ease: EASE },
};

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Eclipta – A Smarter Way to Learn" },
      { name: "description", content: "Eclipta turns learning into a battle arena. Meet the team and the mission behind the world's first adaptive learning playground." },
      { property: "og:title", content: "About Eclipta" },
      { property: "og:description", content: "How Eclipta turns learning into a competitive arena powered by AI, battles, and trophy roads." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="ab">
      {/* Environment — one fixed, evolving atmosphere */}
      <div className="ab-bg" aria-hidden="true">
        <div className="ab-aurora" />
        <div className="ab-grain" />
        <div className="ab-vignette" />
      </div>

      <div className="ab-content">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <header className="ab-hero">
          <div>
            <img src="/eclipta-logo.png" alt="Eclipta" className="ab-hero-logo" width={124} height={124} draggable={false} />
            <p className="ab-kicker">Eclipta · About</p>
            <h1 className="ab-title">
              Learning, but make it <em>an arena.</em>
            </h1>
            <p className="ab-lead">
              The world's first adaptive learning arena — rebuilt from the ground up around
              AI-driven growth, knowledge battles, and a trophy road that actually feels like progress.
            </p>
          </div>
          <div className="ab-scrollhint" aria-hidden="true">
            <span />
            Scroll
          </div>
        </header>

        {/* ── Stats ────────────────────────────────────────────── */}
        <section className="ab-section">
          <motion.div className="ab-stats" {...reveal}>
            {STATS.map((s) => (
              <div key={s.label} className="ab-stat">
                <div className="ab-stat-num">{s.value}</div>
                <div className="ab-stat-lbl">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* ── 01 · Mission ─────────────────────────────────────── */}
        <section className="ab-section">
          <motion.div className="ab-section-head" {...reveal}>
            <p className="ab-actlabel is-accent">01 · The Mission</p>
          </motion.div>
          <motion.p className="ab-mission" {...reveal}>
            Traditional platforms reward <em>completion</em>. Eclipta rewards
            {" "}<strong>growth</strong> — every battle won, every course finished, every
            adaptive test crushed feeds one engine: your XP, unlocking ranks, Ecliptars,
            and challenges. Mastery should feel like <em>leveling up</em>, not grinding.
          </motion.p>
        </section>

        {/* ── 02 · The Arena (pillars) ─────────────────────────── */}
        <section className="ab-section">
          <motion.div className="ab-section-head is-center" {...reveal}>
            <p className="ab-actlabel">02 · The Arena</p>
            <h2 className="ab-h2">Six pillars, <em>one arena.</em></h2>
          </motion.div>
          <motion.div
            className="ab-grid"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ show: { transition: { staggerChildren: 0.07 } } }}
          >
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <motion.div
                  key={p.title}
                  className="ab-pillar"
                  variants={{
                    hidden: { opacity: 0, y: 22, filter: "blur(8px)" },
                    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
                  }}
                >
                  <div className="ab-pillar-icon"><Icon className="w-5 h-5" /></div>
                  <h3>{p.title}</h3>
                  <p>{p.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* ── 03 · The Team ────────────────────────────────────── */}
        <section className="ab-section">
          <motion.div className="ab-section-head is-center" {...reveal}>
            <p className="ab-actlabel">03 · The Team</p>
            <h2 className="ab-h2">Meet the <em>founders.</em></h2>
          </motion.div>
          <div className="ab-founders">
            {FOUNDERS.map((f, i) => (
              <motion.div
                key={f.name}
                className="ab-founder"
                {...reveal}
                transition={{ ...reveal.transition, delay: i * 0.1 }}
              >
                <div className="ab-monogram">{f.initials}</div>
                <div style={{ minWidth: 0 }}>
                  <h3>{f.name}</h3>
                  <p className="ab-founder-role">{f.role}</p>
                  <p>{f.bio}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── 04 · Contact ─────────────────────────────────────── */}
        <section className="ab-section" id="contact" style={{ scrollMarginTop: 96 }}>
          <motion.div className="ab-section-head is-center" {...reveal}>
            <p className="ab-actlabel">04 · Say Hello</p>
            <h2 className="ab-h2">Get in <em>touch.</em></h2>
          </motion.div>
          <motion.div className="ab-contact-grid" {...reveal}>
            <ContactForm />
            <div className="ab-channels">
              <Link to="/forum" className="ab-channel">
                <MessageSquare className="w-5 h-5" />
                <h3>Community Forum</h3>
                <p>Best for product questions and learner support.</p>
              </Link>
              <a href="mailto:hello@eclipta.app" className="ab-channel">
                <Mail className="w-5 h-5" />
                <h3>Direct Email</h3>
                <p style={{ wordBreak: "break-all" }}>hello@eclipta.app</p>
              </a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="ab-channel">
                <Github className="w-5 h-5" />
                <h3>Open Source</h3>
                <p>Report bugs, suggest features, or contribute.</p>
              </a>
            </div>
          </motion.div>
        </section>

        {/* ── Finale ───────────────────────────────────────────── */}
        <section className="ab-finale">
          <motion.div {...reveal}>
            <p className="ab-actlabel" style={{ justifyContent: "center" }}>Your move</p>
            <h2>Enter the <em>arena.</em></h2>
            <p className="ab-finale-sub">
              Pick an archetype, claim your first Ecliptar, and begin your expedition across the realms.
              Free to play — find out what you actually know.
            </p>
            <div className="ab-cta-row">
              <Link to="/signup" className="ab-btn ab-btn--accent">
                Create account
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                  <path d="M0 5 H11 M8 1 L12 5 L8 9" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </Link>
              <Link to="/" className="ab-link">Explore first</Link>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
