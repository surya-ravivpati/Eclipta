import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import type { Variants } from "framer-motion";
import {
  BookOpen, Target, Flame, Award, Clock, ChevronRight,
  Lock, Users, Brain, GitBranch, Layers
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TrophyRoad } from "@/components/TrophyRoad";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { listStudyRooms, type StudyRoom } from "@/lib/study-rooms";
import { CERTIFIED_COURSES } from "@/lib/certified-courses";
import "./Progress.css";

const CERTIFIED_SLUGS = new Set(CERTIFIED_COURSES.map((c) => c.slug));

const TABS = [
  { id: "overview",  label: "Continue Learning" },
  { id: "trophies",  label: "Trophy Road"       },
  { id: "discover",  label: "Discover"          },
] as const;
type TabId = typeof TABS[number]["id"];

/* ── Helpers ───────────────────────────────────────────────── */

function useReveal<T extends Element = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        (el as unknown as HTMLElement).classList.add("in");
        obs.disconnect();
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function AnimatedCounter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, v => Math.round(v).toString());
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !fired.current) {
        fired.current = true;
        animate(mv, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
      }
    }, { threshold: 0.5 });
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

/* ── Sub-components ────────────────────────────────────────── */

function GroupCard({ room, delay = 0 }: { room: StudyRoom; delay?: number }) {
  const ref = useReveal();
  return (
    <Link
      to="/groups/$roomId"
      params={{ roomId: room.id }}
      ref={ref as React.Ref<HTMLAnchorElement>}
      className="pg-reveal pg-group-card"
      style={{ "--rd": `${delay}ms`, display: "block", textDecoration: "none", color: "inherit" } as React.CSSProperties}
    >
      <div className="pg-group-header">
        <div className="pg-group-name">{room.name}</div>
        <div className={`pg-group-dot ${room.is_public ? "pg-group-dot--on" : "pg-group-dot--off"}`} />
      </div>
      <div className="pg-group-topic">{room.topic || (room.is_public ? "Public room" : "Private room")}</div>
      <div className="pg-group-footer">
        <span><Users size={11} />{room.member_count} members</span>
        <span className="pg-group-open">{room.am_member ? "Open" : "Join"} <ChevronRight size={11} /></span>
      </div>
    </Link>
  );
}

/* ── Main Component ────────────────────────────────────────── */

export function ProgressDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const { user } = useAuth();
  const [profile, setProfile] = useState<{
    best_streak: number; total_correct: number; total_questions: number; xp: number;
  } | null>(null);
  const [enrollCount, setEnrollCount] = useState(0);
  const [enrolled, setEnrolled] = useState<{ course_slug: string; course_title: string }[]>([]);
  const [trophiesEarned, setTrophiesEarned] = useState(0);
  const [studyRooms, setStudyRooms] = useState<StudyRoom[]>([]);

  useEffect(() => { void listStudyRooms().then(setStudyRooms); }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [p, e, t] = await Promise.all([
        supabase.from("user_profiles").select("best_streak,total_correct,total_questions,xp").eq("user_id", user.id).maybeSingle(),
        supabase.from("enrollments").select("course_slug,course_title", { count: "exact" }).eq("user_id", user.id).order("enrolled_at", { ascending: false }),
        supabase.from("user_ecliptars").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      if (cancelled) return;
      if (p.data) setProfile(p.data);
      setEnrollCount(e.count ?? 0);
      setEnrolled((e.data as { course_slug: string; course_title: string }[] | null) ?? []);
      setTrophiesEarned(t.count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const accuracy = profile && profile.total_questions > 0
    ? Math.round((profile.total_correct / profile.total_questions) * 100)
    : 0;
  const totalTrophies = 7;

  const stats = [
    { label: "Enrolled",    value: enrollCount,              suffix: enrollCount === 1 ? " Course" : " Courses", color: "oklch(0.80 0.16 240)", Icon: BookOpen },
    { label: "Best Streak", value: profile?.best_streak ?? 0, suffix: " Days",                                  color: "oklch(0.82 0.14 88)",   Icon: Flame   },
    { label: "Accuracy",    value: accuracy,                  suffix: "%",                                       color: "oklch(0.70 0.14 245)",  Icon: Target  },
    { label: "Trophies",    value: trophiesEarned,            suffix: ` / ${totalTrophies}`,                     color: "oklch(0.92 0.06 90)",   Icon: Award   },
  ];

  const tabVariants: Variants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
    exit:    { opacity: 0, y: -12, transition: { duration: 0.25, ease: "easeIn" } },
  };

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
            Your<br /><em>Progress</em>
          </h1>
          <p className="pg-hero-sub">
            Pick up where you left off. Everything you're learning, your structured paths,
            and your rank — all in one place.
          </p>
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
              <div className="pg-stat-bg-icon"><Icon size={56} /></div>
            </div>
          ))}
        </motion.div>

        {/* Tab nav */}
        <motion.div
          className="pg-tabs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.22 }}
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`pg-tab${activeTab === tab.id ? " pg-tab--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div className="pg-tab-bar" layoutId="pg-tab-bar" />
              )}
            </button>
          ))}
        </motion.div>

        {/* Tab panels */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="pg-tab-panel"
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >

            {activeTab === "overview" && (
              <div>
                <div className="pg-sec-head">
                  <div className="pg-sec-title">Active <em>courses</em></div>
                  <div className="pg-sec-desc">Jump back in where you left off.</div>
                </div>
                {enrolled.length === 0 ? (
                  <div className="pg-add-card" style={{ minHeight: 150 }}>
                    <span className="pg-add-card-icon"><BookOpen size={26} /></span>
                    <span className="pg-add-card-lbl">No courses yet</span>
                    <span className="pg-add-card-sub" style={{ display: "flex", gap: 16, marginTop: 6 }}>
                      <Link to="/certified" className="pg-group-open">Browse Certified <ChevronRight size={12} /></Link>
                      <Link to="/courses" className="pg-group-open">Community Courses <ChevronRight size={12} /></Link>
                    </span>
                  </div>
                ) : (
                  <div className="pg-course-grid">
                    {enrolled.map((c) => {
                      const isCert = CERTIFIED_SLUGS.has(c.course_slug);
                      return (
                        <Link
                          key={c.course_slug}
                          to={isCert ? "/certified/$slug" : "/courses/$slug"}
                          params={{ slug: c.course_slug }}
                          className="pg-reveal pg-group-card"
                          style={{ display: "block", textDecoration: "none", color: "inherit" }}
                        >
                          <div className="pg-group-header">
                            <div className="pg-group-name">{c.course_title}</div>
                          </div>
                          <div className="pg-group-footer">
                            <span><BookOpen size={11} /> {isCert ? "Certified" : "Community"}</span>
                            <span className="pg-group-open">Continue <ChevronRight size={11} /></span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "trophies" && (
              <div className="pg-trophy-wrap">
                <TrophyRoad />
              </div>
            )}

            {activeTab === "discover" && (
              <div>
                <div className="pg-sec-head">
                  <div className="pg-sec-title">Study <em>rooms</em></div>
                  <div className="pg-sec-desc">Learn together — join a public room or start your own.</div>
                </div>
                <div className="pg-groups-grid">
                  {studyRooms.slice(0, 5).map((r, i) => (
                    <GroupCard key={r.id} room={r} delay={i * 60} />
                  ))}
                  <Link to="/groups" className="pg-add-card" style={{ minHeight: "160px", textDecoration: "none" }}>
                    <span className="pg-add-card-icon"><Users size={24} /></span>
                    <span className="pg-add-card-lbl">{studyRooms.length ? "Browse all rooms" : "Create Study Room"}</span>
                  </Link>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
