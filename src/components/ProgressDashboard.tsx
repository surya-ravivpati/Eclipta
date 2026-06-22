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
import "./Progress.css";

/* ── Mock Data ─────────────────────────────────────────────── */

const enrolledCourses = [
  { id: 1, title: "Linear Algebra Foundations",    progress: 78, totalLessons: 24, completed: 19, category: "Mathematics",     streak: 5,  nextMilestone: "Chapter Quiz",      color: "oklch(0.80 0.16 240)" },
  { id: 2, title: "FAANG Interview Prep",          progress: 42, totalLessons: 60, completed: 25, category: "Computer Science", streak: 12, nextMilestone: "Mock Interview #3", color: "oklch(0.72 0.22 0)"   },
  { id: 3, title: "Organic Chemistry",             progress: 15, totalLessons: 32, completed: 5,  category: "Science",          streak: 2,  nextMilestone: "Lab Simulation",     color: "oklch(0.82 0.14 165)" },
  { id: 4, title: "Data Structures & Algorithms",  progress: 91, totalLessons: 40, completed: 36, category: "Computer Science", streak: 8,  nextMilestone: "Final Assessment",   color: "oklch(0.80 0.16 240)" },
];

const learningPaths = [
  {
    id: 1, title: "Full-Stack Developer", type: "intensive" as const, duration: "6 months", courses: 8, completed: 3,
    description: "A structured path from fundamentals to deployment, covering frontend, backend, databases, and DevOps.",
    prerequisites: ["Basic Programming", "HTML/CSS Basics"],
    milestones: [
      { label: "Web Fundamentals",    done: true  },
      { label: "JavaScript Deep Dive", done: true  },
      { label: "React Mastery",        done: true  },
      { label: "Backend & APIs",       done: false, current: true  },
      { label: "Databases",            done: false },
      { label: "DevOps & Deploy",      done: false },
    ],
  },
  {
    id: 2, title: "Quick Stats Refresher", type: "casual" as const, duration: "2 weeks", courses: 3, completed: 1,
    description: "A short path to brush up on probability, distributions, and hypothesis testing.",
    prerequisites: ["Algebra"],
    milestones: [
      { label: "Probability Basics",   done: true  },
      { label: "Distributions",        done: false, current: true  },
      { label: "Hypothesis Testing",   done: false },
    ],
  },
  {
    id: 3, title: "Machine Learning Engineer", type: "intensive" as const, duration: "9 months", courses: 12, completed: 0,
    description: "From linear algebra through neural networks to production ML systems.",
    prerequisites: ["Linear Algebra", "Python", "Statistics"],
    milestones: [
      { label: "Math Foundations", done: false, current: true  },
      { label: "Classical ML",     done: false },
      { label: "Deep Learning",    done: false },
      { label: "NLP & Vision",     done: false },
      { label: "MLOps",            done: false },
    ],
  },
];

const recommendations = [
  { title: "Discrete Mathematics",    reason: "Complements your Data Structures course",  match: 94 },
  { title: "System Design",           reason: "Next step after FAANG Interview Prep",      match: 89 },
  { title: "Probability & Statistics", reason: "Prerequisite for Machine Learning path",  match: 85 },
  { title: "Graph Theory",            reason: "You excelled at tree-based problems",       match: 78 },
];

const TABS = [
  { id: "overview",  label: "Continue Learning" },
  { id: "paths",     label: "Paths"             },
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

function CourseProgressCard({ course, delay = 0 }: { course: typeof enrolledCourses[0]; delay?: number }) {
  const ref = useReveal();
  return (
    <div
      ref={ref}
      className="pg-reveal pg-course-card"
      style={{ "--cc": course.color, "--rd": `${delay}ms` } as React.CSSProperties}
    >
      <div className="pg-course-cat">{course.category}</div>
      <div className="pg-course-title">{course.title}</div>
      <div className="pg-bar-wrap">
        <motion.div
          className="pg-bar"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: course.progress / 100 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: delay / 1000 + 0.2 }}
        />
      </div>
      <div className="pg-course-meta">
        <span>{course.completed}/{course.totalLessons} lessons</span>
        <span className="pg-course-pct">{course.progress}%</span>
      </div>
      <div className="pg-course-foot">
        <span className="pg-course-next">Next — {course.nextMilestone}</span>
        <span className="pg-course-streak">
          <Flame size={12} />
          {course.streak}d
        </span>
      </div>
    </div>
  );
}

function PathCard({ path, delay = 0 }: { path: typeof learningPaths[0]; delay?: number }) {
  const ref = useReveal();
  const pct = Math.round((path.completed / path.courses) * 100);
  return (
    <div
      ref={ref}
      className="pg-reveal pg-path-card"
      style={{ "--rd": `${delay}ms` } as React.CSSProperties}
    >
      <div>
        <span className={`pg-path-type pg-path-type--${path.type}`}>{path.type}</span>
      </div>
      <div className="pg-path-title">{path.title}</div>
      <div className="pg-path-desc">{path.description}</div>
      <div className="pg-path-meta">
        <span><Clock size={11} />{path.duration}</span>
        <span><Layers size={11} />{path.courses} courses</span>
      </div>
      <div className="pg-prereq-row">
        {path.prerequisites.map(p => (
          <span key={p} className="pg-prereq-tag">{p}</span>
        ))}
      </div>
      <div className="pg-ms-row">
        {path.milestones.map((m, i) => (
          <React.Fragment key={m.label}>
            <div
              className={`pg-ms-dot ${m.done ? "pg-ms-dot--done" : (m as typeof m & { current?: boolean }).current ? "pg-ms-dot--now" : "pg-ms-dot--lock"}`}
              title={m.label}
            >
              {m.done ? "✓" : (m as typeof m & { current?: boolean }).current ? "●" : <Lock size={8} />}
            </div>
            {i < path.milestones.length - 1 && (
              <div className={`pg-ms-line ${m.done ? "pg-ms-line--done" : "pg-ms-line--pend"}`} />
            )}
          </React.Fragment>
        ))}
      </div>
      <div>
        <div className="pg-path-bar-wrap">
          <motion.div
            className="pg-path-bar"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: pct / 100 }}
            viewport={{ once: true }}
            transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: delay / 1000 + 0.2 }}
          />
        </div>
        <div className="pg-path-pct">{pct}% complete</div>
      </div>
    </div>
  );
}

function RecCard({ rec, delay = 0 }: { rec: typeof recommendations[0]; delay?: number }) {
  const ref = useReveal();
  return (
    <div
      ref={ref}
      className="pg-reveal pg-rec-card"
      style={{ "--rd": `${delay}ms` } as React.CSSProperties}
    >
      <div className="pg-rec-icon"><Brain size={20} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pg-rec-title">{rec.title}</div>
        <div className="pg-rec-reason">{rec.reason}</div>
      </div>
      <div className="pg-rec-match-col">
        <div className="pg-rec-match-num">{rec.match}</div>
        <div className="pg-rec-match-lbl">match</div>
      </div>
    </div>
  );
}

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
  const [trophiesEarned, setTrophiesEarned] = useState(0);
  const [studyRooms, setStudyRooms] = useState<StudyRoom[]>([]);

  useEffect(() => { void listStudyRooms().then(setStudyRooms); }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [p, e, t] = await Promise.all([
        supabase.from("user_profiles").select("best_streak,total_correct,total_questions,xp").eq("user_id", user.id).maybeSingle(),
        supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("user_ecliptars").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      if (cancelled) return;
      if (p.data) setProfile(p.data);
      setEnrollCount(e.count ?? 0);
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
    { label: "Best Streak", value: profile?.best_streak ?? 0, suffix: " Days",                                  color: "oklch(0.72 0.22 0)",    Icon: Flame   },
    { label: "Accuracy",    value: accuracy,                  suffix: "%",                                       color: "oklch(0.82 0.14 165)",  Icon: Target  },
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
                <div className="pg-course-grid">
                  {enrolledCourses.map((c, i) => (
                    <CourseProgressCard key={c.id} course={c} delay={i * 60} />
                  ))}
                </div>
              </div>
            )}

            {activeTab === "paths" && (
              <div>
                <div className="pg-sec-head">
                  <div className="pg-sec-title">Learning <em>paths</em></div>
                  <div className="pg-sec-desc">Follow structured intensive programs or pick casual refreshers.</div>
                </div>
                <div className="pg-pill-row">
                  <button className="pg-pill pg-pill--active">All</button>
                  <button className="pg-pill">Intensive</button>
                  <button className="pg-pill">Casual</button>
                </div>
                <div className="pg-path-grid">
                  {learningPaths.map((p, i) => (
                    <PathCard key={p.id} path={p} delay={i * 60} />
                  ))}
                  <div className="pg-add-card">
                    <span className="pg-add-card-icon"><GitBranch size={28} /></span>
                    <span className="pg-add-card-lbl">Build Custom Path</span>
                    <span className="pg-add-card-sub">Mix courses from any topic into your own learning journey</span>
                  </div>
                </div>
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
                  <div className="pg-sec-title">Recommended <em>for you</em></div>
                  <div className="pg-sec-desc">Based on your goals and performance — Luna's next-step picks.</div>
                </div>
                <div className="pg-recs-grid">
                  {recommendations.map((r, i) => (
                    <RecCard key={r.title} rec={r} delay={i * 60} />
                  ))}
                </div>

                <div className="pg-sec-head" style={{ marginTop: 52 }}>
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
