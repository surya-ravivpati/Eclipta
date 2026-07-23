import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import {
  Mail, Github, MessageSquare, Send, CheckCircle2, Loader2, AlertCircle, Camera,
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
        toast.error(error.message || "Couldn't send. Try again in a moment.");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((data as any)?.moderation_status === "hidden") {
        toast.message("Message received, held for review", {
          description: "I'll look at it shortly.",
        });
      } else {
        toast.success("Message sent. I usually reply within a couple of days.");
      }
      setSent(true);
      setName(""); setEmail(""); setSubject(""); setMessage("");
      setErrors({});
    } catch (err) {
      console.error("contact form submit failed", err);
      toast.error("Network hiccup. Please try again.");
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
          Thanks for reaching out. I read everything that lands in the inbox
          and usually reply within a couple of days.
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
          <h3 className="ab-serif" style={{ fontSize: 18, lineHeight: 1.1 }}>Send me a message</h3>
          <p style={{ fontSize: 11, color: "var(--ab-fog)", marginTop: 2 }}>Goes straight to my inbox.</p>
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
          placeholder="What's on your mind? Feedback, questions, bugs, all welcome."
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

// shared scroll-reveal — a gentle blur-in for reading, calmer than the
// homepage film's big cinematic beats.
const EASE: [number, number, number, number] = [0.2, 0.7, 0.2, 1];
const reveal = {
  initial: { opacity: 0, y: 20, filter: "blur(8px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, amount: 0.4 },
  transition: { duration: 0.8, ease: EASE },
};

/**
 * A snapshot frame. Drop a real photo at the given /public path and it shows;
 * until then it falls back to a tasteful placeholder instead of a broken
 * image. Swap in: public/about/brothers.jpg, public/about/desk.jpg, etc.
 */
function Snapshot({ src, caption, tilt = 0 }: { src: string; caption: string; tilt?: number }) {
  // Start on the placeholder and only swap in the real photo once it actually
  // loads. A missing file simply never fires onLoad, so a broken-image icon or
  // stray alt text can never flash — the frame just stays a tasteful stand-in.
  const [loaded, setLoaded] = useState(false);
  return (
    <figure className="ab-photo">
      <div className="ab-photo-inner" style={{ ["--tilt" as string]: `${tilt}deg` }}>
        {!loaded && (
          <div className="ab-photo-ph"><Camera className="w-5 h-5" /><span>photo</span></div>
        )}
        <img
          src={src}
          alt={caption}
          onLoad={() => setLoaded(true)}
          style={{ display: loaded ? "block" : "none" }}
        />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About the Creator – Eclipta" },
      { name: "description", content: "Why Eclipta exists, told by the person who built it. A short, honest letter about failing at a project, learning to actually understand the code, and building the course he wished he'd had." },
      { property: "og:title", content: "About the Creator – Eclipta" },
      { property: "og:description", content: "The honest story behind Eclipta: one builder, one abandoned game, and the course that came out of it." },
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
            <p className="ab-kicker">About · The Creator</p>
            <h1 className="ab-title">
              Hi, I'm <em>Aarit.</em>
            </h1>
            <p className="ab-lead">
              I wanted to build a game where you can box an AI with your webcam.
              Somehow that turned into this. Here's the honest version of how.
            </p>
          </div>
          <div className="ab-scrollhint" aria-hidden="true">
            <span />
            Read
          </div>
        </header>

        {/* ── The letter ───────────────────────────────────────── */}
        <section className="ab-letter-wrap">
          <motion.p className="ab-actlabel is-accent" {...reveal}>The whole story</motion.p>

          <div className="ab-letter">
            <motion.p {...reveal}>
              I built this because I wanted to make a game where you can box an AI with your webcam.
            </motion.p>

            <motion.p {...reveal}>
              I tried building it once already. I mostly leaned on AI to write the code. It worked for a
              while, then the whole project turned into a pile of code I didn't understand. Every change
              broke something else. After a few weeks, I gave up.
            </motion.p>

            <motion.blockquote className="ab-pull" {...reveal}>
              That bugged me more than the game itself.
            </motion.blockquote>

            <motion.div className="ab-photos" {...reveal}>
              <Snapshot src="/about/me.jpg" caption="Me, mid-project, pretending it was fine." tilt={-3} />
              <Snapshot src="/about/brothers.jpg" caption="My brother (the handsome guy on the left) and me." tilt={2.5} />
            </motion.div>

            <motion.p {...reveal}>
              My brother (the handsome guy on the left in the second picture) builds stuff with AI too,
              but his projects don't fall apart like mine. I kept asking myself why.
            </motion.p>

            <motion.p {...reveal}>
              Then I went on vacation with him, and I figured it out. He knows what's going on under the
              hood. I don't. If AI writes something weird, he can spot it. I usually can't.
            </motion.p>

            <motion.blockquote className="ab-pull" {...reveal}>
              I was using AI to replace understanding instead of helping it along.
            </motion.blockquote>

            <motion.p {...reveal}>
              That was enough to change my plan.
            </motion.p>

            <motion.p {...reveal}>
              Instead of trying to build the game again, I decided to build the course I wish I had the
              first time. If I can explain each piece well enough for someone else to learn it, I'll
              probably understand it well enough to build the game without creating another mess. And if
              this course helps other people make their own games, that's even better.
            </motion.p>

            <motion.p {...reveal}>
              My goal is still the same as it was on day one. I still want to step in front of my webcam
              and box an AI. I'm just taking the longer road to get there because I think it'll end up
              being the shorter one.
            </motion.p>

            <motion.p {...reveal}>
              Hope this isn't the last thing I build. (Besides, I already have a list of projects I want
              to make after this one.)
            </motion.p>

            <motion.div className="ab-signoff" {...reveal}>
              <p className="ab-sign">Aarit</p>
              <a href="mailto:perswalaarit@gmail.com" className="ab-sign-mail">perswalaarit@gmail.com</a>
            </motion.div>

            <motion.div className="ab-ps" {...reveal}>
              <p>
                <span className="ab-ps-tag">PS</span>
                Yes, I took all those background pictures myself cuz im tuff like that.
              </p>
              <p>
                <span className="ab-ps-tag">PSS</span>
                Thanks for reading all this. In fact, I have a present for you. But I need you to click the
                {" "}
                <span className="ab-hint-logo" aria-hidden="true">
                  <img src="/eclipta-logo.png" alt="" width={18} height={18} draggable={false} />
                </span>
                {" "}
                <b>logo in the top-left 5 times, quickly</b>, to get it.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── What this is ─────────────────────────────────────── */}
        <section className="ab-section">
          <motion.div className="ab-section-head" {...reveal}>
            <p className="ab-actlabel">What this is</p>
          </motion.div>
          <motion.p className="ab-brief" {...reveal}>
            <strong>Eclipta is that course.</strong> A place to actually learn the thing you keep asking AI
            to do for you, one piece at a time, until you can read what it writes and know when it's
            {" "}<em>wrong.</em>
          </motion.p>
        </section>

        {/* ── Reach me ─────────────────────────────────────────── */}
        <section className="ab-section" id="contact" style={{ scrollMarginTop: 96 }}>
          <motion.div className="ab-section-head is-center" {...reveal}>
            <p className="ab-actlabel">Say hello</p>
            <h2 className="ab-h2">Reach <em>me.</em></h2>
          </motion.div>
          <motion.div className="ab-contact-grid" {...reveal}>
            <ContactForm />
            <div className="ab-channels">
              <a href="mailto:perswalaarit@gmail.com" className="ab-channel">
                <Mail className="w-5 h-5" />
                <h3>Email me directly</h3>
                <p style={{ wordBreak: "break-all" }}>perswalaarit@gmail.com</p>
              </a>
              <Link to="/forum" className="ab-channel">
                <MessageSquare className="w-5 h-5" />
                <h3>Community Forum</h3>
                <p>Questions, help, and learning out loud with everyone else.</p>
              </Link>
              <a href="https://github.com/surya-ravivpati/eclipta-your-smart-learning-journey" target="_blank" rel="noopener noreferrer" className="ab-channel">
                <Github className="w-5 h-5" />
                <h3>The code</h3>
                <p>It's open. Poke around, report bugs, or contribute.</p>
              </a>
            </div>
          </motion.div>
        </section>

        {/* ── Finale ───────────────────────────────────────────── */}
        <section className="ab-finale">
          <motion.div {...reveal}>
            <p className="ab-actlabel" style={{ justifyContent: "center" }}>Your turn</p>
            <h2>Start the <em>course.</em></h2>
            <p className="ab-finale-sub">
              Learn the thing you keep leaning on AI for. Free to start, no pretending you already get it.
            </p>
            <div className="ab-cta-row">
              <Link to="/courses" className="ab-btn ab-btn--accent">
                Browse courses
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                  <path d="M0 5 H11 M8 1 L12 5 L8 9" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </Link>
              <Link to="/signup" className="ab-link">Create an account</Link>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
