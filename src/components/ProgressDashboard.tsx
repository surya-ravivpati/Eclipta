import React, { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { BookOpen, Target, Flame, Award } from "lucide-react";
import { TrophyRoad } from "@/components/TrophyRoad";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getEnrollmentsWithCount } from "@/repositories/courses";
import "./Progress.css";

/* -- Helpers ------------------------------------------------- */

function AnimatedCounter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toString());
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fired.current) {
          fired.current = true;
          animate(mv, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [mv, to]);

  return (
    <span ref={ref}>
      <motion.span>{rounded}</motion.span>
      {suffix && <span className="pg-stat-suffix">{suffix}</span>}
    </span>
  );
}

/* -- Main Component ------------------------------------------ */

export function ProgressDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<{
    best_streak: number;
    total_correct: number;
    total_questions: number;
    xp: number;
  } | null>(null);
  const [enrollCount, setEnrollCount] = useState(0);
  const [trophiesEarned, setTrophiesEarned] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [p, e, t] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("best_streak,total_correct,total_questions,xp")
          .eq("user_id", user.id)
          .maybeSingle(),
        getEnrollmentsWithCount(user.id),
        supabase
          .from("user_ecliptars")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);
      if (cancelled) return;
      if (p.data) setProfile(p.data);
      setEnrollCount(e.count);
      setTrophiesEarned(t.count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const accuracy =
    profile && profile.total_questions > 0
      ? Math.round((profile.total_correct / profile.total_questions) * 100)
      : 0;
  const totalTrophies = 7;

  const stats = [
    {
      label: "Enrolled",
      value: enrollCount,
      suffix: enrollCount === 1 ? " Course" : " Courses",
      color: "oklch(0.80 0.16 240)",
      Icon: BookOpen,
    },
    {
      label: "Best Streak",
      value: profile?.best_streak ?? 0,
      suffix: " Days",
      color: "oklch(0.82 0.14 88)",
      Icon: Flame,
    },
    {
      label: "Accuracy",
      value: accuracy,
      suffix: "%",
      color: "oklch(0.70 0.14 245)",
      Icon: Target,
    },
    {
      label: "Trophies",
      value: trophiesEarned,
      suffix: ` / ${totalTrophies}`,
      color: "oklch(0.92 0.06 90)",
      Icon: Award,
    },
  ];

  return (
    <div className="pg-shell">
      <div className="pg-bg" aria-hidden="true">
        <div className="pg-aurora" />
        <div className="pg-grid" />
        <div className="pg-noise" />
      </div>

      <div className="pg-wrap">
        {/* Hero */}
        <motion.div
          className="pg-hero"
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="pg-label">Learning Arc</div>
          <h1 className="pg-headline">
            Your
            <br />
            <em>Progress</em>
          </h1>
          <p className="pg-hero-sub">Every realm, rank, and reward on your climb.</p>
        </motion.div>

        {/* Stats */}
        <motion.div
          className="pg-stats"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
        >
          {stats.map(({ label, value, suffix, color, Icon }) => (
            <div key={label} className="pg-stat" style={{ "--sc": color } as React.CSSProperties}>
              <div className="pg-stat-lbl">{label}</div>
              <div className="pg-stat-num">
                <AnimatedCounter to={value} suffix={suffix} />
              </div>
              <div className="pg-stat-bg-icon">
                <Icon size={56} />
              </div>
            </div>
          ))}
        </motion.div>

        <motion.div
          className="pg-trophy-wrap"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.18 }}
        >
          <TrophyRoad />
        </motion.div>
      </div>
    </div>
  );
}
