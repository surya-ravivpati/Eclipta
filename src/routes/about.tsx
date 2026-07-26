import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import {
  Mail,
  Github,
  MessageSquare,
  Send,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Camera,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EASING } from "@/config/motion";
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
    const n = name.trim(),
      e = email.trim(),
      m = message.trim();
    if (n.length < 2) next.name = "At least 2 characters.";
    else if (n.length > 80) next.name = "Keep it under 80 characters.";
    if (!EMAIL_RE.test(e)) next.email = "Enter a valid email.";
    if (m.length < 10) next.message = "Add a bit more detail (10+ characters).";
    else if (m.length > 4000) next.message = "Trim it under 4000 characters.";
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
      const { data, error } = await supabase.rpc("submit_contact_message", {
        p_name: name.trim(),
        p_email: email.trim(),
        p_subject: subject.trim() || null,
        p_message: message.trim(),
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
      if (error) {
        toast.error(error.message || "Couldn't send. Try again in a moment.");
        return;
      }

      if (data?.moderation_status === "hidden") {
        toast.message("Message received, held for review", {
          description: "We'll look at it shortly.",
        });
      } else {
        toast.success("Message sent. We usually reply within a couple of days.");
      }
      setSent(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
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
        <h3 className="ab-serif" style={{ fontSize: 22, marginBottom: 8 }}>
          Message received
        </h3>
        <p
          style={{
            fontSize: 14,
            color: "var(--ab-dim)",
            maxWidth: 360,
            margin: "0 auto 20px",
            lineHeight: 1.6,
          }}
        >
          Thanks for reaching out. We read everything that lands in the inbox and usually reply
          within a couple of days.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="ab-link"
          style={{ borderRadius: 6 }}
        >
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
          <h3 className="ab-serif" style={{ fontSize: 18, lineHeight: 1.1 }}>
            Send us a message
          </h3>
          <p style={{ fontSize: 11, color: "var(--ab-fog)", marginTop: 2 }}>
            Goes straight to our inbox.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field
          label="Name"
          value={name}
          onChange={setName}
          maxLength={80}
          error={errors.name}
          onBlur={onBlur("name")}
          autoComplete="name"
          required
        />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          maxLength={120}
          error={errors.email}
          onBlur={onBlur("email")}
          autoComplete="email"
          required
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <Field
          label="Subject"
          value={subject}
          onChange={setSubject}
          maxLength={120}
          placeholder="What's this about? (optional)"
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="ab-flabel">
          <span>
            Message <span className="req">*</span>
          </span>
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
          <p className="ab-ferror">
            <AlertCircle className="w-3 h-3" />
            {errors.message}
          </p>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
          marginTop: 20,
        }}
      >
        <p className="ab-fhint">
          By submitting, you agree we may reply to{" "}
          <span style={{ color: "var(--ab-dim)" }}>{email.trim() || "your email"}</span>.
        </p>
        <button type="submit" disabled={submitting} className="ab-btn ab-btn--accent">
          {submitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              Send message
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
  placeholder,
  error,
  onBlur,
  autoComplete,
  required,
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
        <span>
          {label} {required && <span className="req">*</span>}
        </span>
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
        <p className="ab-ferror">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Page content ────────────────────────────────────────────────────

// shared scroll-reveal — a gentle blur-in for reading, calmer than the
// homepage film's big cinematic beats.
const EASE = EASING.soft;
const reveal = {
  initial: { opacity: 0, y: 20, filter: "blur(8px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, amount: 0.4 },
  transition: { duration: 0.8, ease: EASE },
};

/**
 * A founder portrait + credit. Drop a real photo at the given /public path and
 * it shows; until then it falls back to a tasteful placeholder instead of a
 * broken image. The photo only swaps in once it actually loads, so a missing
 * file never flashes a broken-image icon. Swap in: public/about/aarit.jpg and
 * public/about/surya.jpg.
 */
function FounderCard({
  name,
  role,
  src,
  email,
  tilt = 0,
}: {
  name: string;
  role: string;
  src: string;
  email: string;
  tilt?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="ab-person">
      <div className="ab-photo-inner" style={{ ["--tilt" as string]: `${tilt}deg` }}>
        {!loaded && (
          <div className="ab-photo-ph">
            <Camera className="w-5 h-5" />
            <span>photo</span>
          </div>
        )}
        <img
          src={src}
          alt={name}
          onLoad={() => setLoaded(true)}
          style={{ display: loaded ? "block" : "none" }}
        />
      </div>
      <h3 className="ab-person-name">{name}</h3>
      <p className="ab-person-role">{role}</p>
      <a href={`mailto:${email}`} className="ab-person-mail">
        {email}
      </a>
    </div>
  );
}

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Eclipta – Why we built it" },
      {
        name: "description",
        content:
          "Eclipta is an AI-powered learning platform built on one idea: AI should help you learn, not learn for you. The honest story from the two friends building it.",
      },
      { property: "og:title", content: "About Eclipta – Why we built it" },
      {
        property: "og:description",
        content:
          "AI should help you learn, not learn for you. The story behind Eclipta, from the two friends building it.",
      },
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
            <img
              src="/eclipta-logo.png"
              alt="Eclipta"
              className="ab-hero-logo"
              width={124}
              height={124}
              draggable={false}
            />
            <p className="ab-kicker">About · Eclipta</p>
            <h1 className="ab-title">
              Hi, we're <em>Eclipta.</em>
            </h1>
            <p className="ab-lead">
              We wanted to build a place where learning could actually feel like learning again.
              Somewhere you could ask a question, get help from AI, make mistakes, try again, and
              slowly become the person who doesn't need the answer handed to you anymore.
            </p>
            <p className="ab-lead-2">
              Somehow, that turned into Eclipta. Here's the honest version of how.
            </p>
          </div>
          <div className="ab-scrollhint" aria-hidden="true">
            <span />
            Read
          </div>
        </header>

        {/* ── The letter ───────────────────────────────────────── */}
        <section className="ab-letter-wrap">
          <motion.p className="ab-actlabel is-accent" {...reveal}>
            The whole story
          </motion.p>

          <div className="ab-letter">
            <motion.p {...reveal}>
              We started Eclipta because we kept noticing the same thing happening everywhere.
            </motion.p>

            <motion.p {...reveal}>AI was getting really good at doing things for us.</motion.p>

            <motion.p className="ab-verse" {...reveal}>
              Writing the essay.
              <br />
              Solving the equation.
              <br />
              Explaining the concept.
              <br />
              Writing the code.
            </motion.p>

            <motion.p {...reveal}>And, honestly, it was amazing.</motion.p>

            <motion.p {...reveal}>But there was a problem.</motion.p>

            <motion.p {...reveal}>
              It was getting really easy to finish something without actually understanding it.
            </motion.p>

            <motion.p {...reveal}>
              We found ourselves asking AI questions and getting answers that worked, but we didn't
              always know why they worked. We could copy the code, but couldn't always explain it.
              We could get the answer to a problem, but couldn't always solve the next one on our
              own.
            </motion.p>

            <motion.p {...reveal}>And we realized we probably weren't the only ones.</motion.p>

            <motion.blockquote className="ab-pull" {...reveal}>
              AI shouldn't replace learning. It should make learning better.
            </motion.blockquote>

            <motion.p {...reveal}>That idea became Eclipta.</motion.p>

            <motion.p {...reveal}>
              We wanted to build something that could give you the help of AI without taking away
              the part that actually matters: understanding.
            </motion.p>

            <motion.p {...reveal}>
              Instead of just giving you the answer, Eclipta is designed to help you figure out how
              to get there. To meet you where you are. To explain something differently when you
              don't get it the first time. To challenge you when you're ready for more. And to make
              learning feel a little less like memorizing information and a little more like
              actually discovering something.
            </motion.p>

            <motion.p {...reveal}>
              Because we don't think the goal of education should be to know everything.
            </motion.p>

            <motion.blockquote className="ab-pull" {...reveal}>
              The goal should be to become someone who can figure things out.
            </motion.blockquote>

            <motion.p {...reveal}>That's what we want Eclipta to help people become.</motion.p>

            <motion.p {...reveal}>
              We also wanted learning to feel more personal. Everyone learns differently. Some
              people need a visual explanation. Some need to try something themselves. Some need to
              hear an idea explained five different ways before it finally clicks. So why should
              everyone learn the exact same way?
            </motion.p>

            <motion.p {...reveal}>
              Eclipta is our attempt to build something that adapts to the person using it, instead
              of asking the person to adapt to it.
            </motion.p>

            <motion.p {...reveal}>
              It's still a work in progress. There are a lot of things we want to build. A lot of
              ideas we want to try. And probably a lot of things we'll get wrong along the way. But
              that's kind of the point.
            </motion.p>

            <motion.blockquote className="ab-pull" {...reveal}>
              We're building Eclipta while learning how to build Eclipta.
            </motion.blockquote>

            <motion.p {...reveal}>And we think that's a pretty good place to start.</motion.p>

            <motion.p {...reveal}>
              We hope Eclipta becomes more than just another place to find answers. We hope it
              becomes a place where people learn how to find their own.
            </motion.p>

            <motion.div className="ab-signoff" {...reveal}>
              <p className="ab-sign">The Eclipta Team</p>
            </motion.div>

            <motion.div className="ab-ps" {...reveal}>
              <p>
                <span className="ab-ps-tag">PS</span>
                Thanks for reading all this. We have a present for you. Click the{" "}
                <span className="ab-hint-logo" aria-hidden="true">
                  <img src="/eclipta-logo.png" alt="" width={18} height={18} draggable={false} />
                </span>{" "}
                <b>logo in the top-left 5 times, quickly</b>, to get it.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── The two of us ────────────────────────────────────── */}
        <section className="ab-section">
          <motion.div className="ab-section-head is-center" {...reveal}>
            <p className="ab-actlabel">Who's building it</p>
            <h2 className="ab-h2">
              The <em>two of us.</em>
            </h2>
          </motion.div>
          <motion.p className="ab-people-intro" {...reveal}>
            Two friends building every part of Eclipta together.
          </motion.p>
          <motion.div className="ab-people" {...reveal}>
            <FounderCard
              name="Aarit Perswal"
              role="Co-founder · builds all of it"
              src="/about/aarit.jpg"
              email="perswalaarit@gmail.com"
              tilt={-2}
            />
            <FounderCard
              name="Surya Ravipati"
              role="Co-founder · builds all of it"
              src="/about/surya.jpg"
              email="suryarvpt@gmail.com"
              tilt={2}
            />
          </motion.div>
        </section>

        {/* ── What this is ─────────────────────────────────────── */}
        <section className="ab-section">
          <motion.div className="ab-section-head" {...reveal}>
            <p className="ab-actlabel">What this is</p>
          </motion.div>
          <motion.p className="ab-brief" {...reveal}>
            Eclipta is an AI-powered learning platform built around a simple idea:{" "}
            <strong>AI should help you learn, not learn for you.</strong>
          </motion.p>
          <motion.div className="ab-what-body" {...reveal}>
            <p>
              It's a place to explore concepts, ask questions, practice skills, make mistakes, and
              keep going until things finally click.
            </p>
            <p>
              Whether you're learning something completely new or trying to understand something
              you've been stuck on for weeks, Eclipta is here to help you take the next step.
            </p>
            <p className="ab-what-coda">
              One concept at a time. One question at a time. Until you don't need the answer
              anymore.
            </p>
          </motion.div>
        </section>

        {/* ── Reach us ─────────────────────────────────────────── */}
        <section className="ab-section" id="contact" style={{ scrollMarginTop: 96 }}>
          <motion.div className="ab-section-head is-center" {...reveal}>
            <p className="ab-actlabel">Say hello</p>
            <h2 className="ab-h2">
              Reach <em>us.</em>
            </h2>
          </motion.div>
          <motion.div className="ab-contact-grid" {...reveal}>
            <ContactForm />
            <div className="ab-channels">
              <Link to="/forum" className="ab-channel">
                <MessageSquare className="w-5 h-5" />
                <h3>Community Forum</h3>
                <p>Questions, help, and learning out loud with everyone else.</p>
              </Link>
              <a
                href="https://github.com/surya-ravivpati/eclipta-your-smart-learning-journey"
                target="_blank"
                rel="noopener noreferrer"
                className="ab-channel"
              >
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
            <p className="ab-actlabel" style={{ justifyContent: "center" }}>
              Your turn
            </p>
            <h2>
              Start <em>learning.</em>
            </h2>
            <p className="ab-finale-sub">
              Learn with AI that helps you understand, instead of doing it for you. Free to start.
            </p>
            <div className="ab-cta-row">
              <Link to="/courses" className="ab-btn ab-btn--accent">
                Browse courses
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                  <path d="M0 5 H11 M8 1 L12 5 L8 9" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </Link>
              <Link to="/signup" className="ab-link">
                Create an account
              </Link>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
