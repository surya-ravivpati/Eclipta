import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search, Sparkles, ArrowRight, BookOpen, Loader2, Users, Star,
  ShieldCheck, GraduationCap, X, Check, Lock, CircleDot, Circle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  SUBJECTS, type Subject, type UnifiedCourse, type CommunityCourseRow,
  certifiedToUnified, communityToUnified, searchScore,
} from "@/lib/courses";
import {
  recommend, deriveMastery, buildPath, activeSubject,
  type Recommendation, type PathStep, type LearnerState,
} from "@/lib/recommend";

export const Route = createFileRoute("/courses")({
  head: () => ({
    meta: [
      { title: "Courses – Eclipta" },
      { name: "description", content: "One library. Everything you're learning, and what to learn next — official and community courses, personalized to you." },
      { property: "og:title", content: "Courses – Eclipta" },
      { property: "og:description", content: "One unified learning library, personalized to you." },
    ],
  }),
  component: CoursesHub,
});

const EASE = [0.2, 0.7, 0.2, 1];

/* Progress (best-effort — course_progress may not exist yet; we fall back to
   enrollments). Keyed by course_slug. */
interface Progress {
  percent: number;
  status: string;
  lastOpened: string;
}

interface ContinueItem extends UnifiedCourse {
  percent: number;
  lastOpened: string;
}

function CoursesHub() {
  const { user, isAuthenticated } = useAuth();
  const [community, setCommunity] = useState<UnifiedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolledSlugs, setEnrolledSlugs] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [strongAreas, setStrongAreas] = useState<string[]>([]);
  const [weakAreas, setWeakAreas] = useState<string[]>([]);

  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<Subject | null>(null);

  // Load published community courses + (if signed in) enrollment & progress.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_courses")
        .select("id,slug,title,summary,level,depth,enrolled_count,cover_image_url")
        .eq("status", "published")
        .order("enrolled_count", { ascending: false })
        .limit(120);
      if (cancelled) return;
      setCommunity(communityToUnified((data as CommunityCourseRow[]) || []));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user) {
      setEnrolledSlugs(new Set()); setProgress({}); setStrongAreas([]); setWeakAreas([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: en } = await supabase
        .from("enrollments")
        .select("course_slug,enrolled_at")
        .eq("user_id", user.id);
      if (cancelled) return;
      setEnrolledSlugs(new Set((en ?? []).map((r) => r.course_slug)));

      // Weak/strong areas feed the recommendation engine (Phase 2).
      const { data: prof } = await supabase
        .from("user_profiles")
        .select("weak_areas,strong_areas")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && prof) {
        setStrongAreas(Array.isArray(prof.strong_areas) ? prof.strong_areas : []);
        setWeakAreas(Array.isArray(prof.weak_areas) ? prof.weak_areas : []);
      }

      // Best-effort: course_progress may not be migrated yet. Seed lastOpened
      // from enrollments so Continue Learning works either way.
      const base: Record<string, Progress> = {};
      for (const r of en ?? []) base[r.course_slug] = { percent: 0, status: "enrolled", lastOpened: r.enrolled_at };
      try {
        const { data: prog, error } = await supabase
          .from("course_progress")
          .select("course_slug,percent,status,last_opened_at")
          .eq("user_id", user.id);
        if (!error && prog) {
          for (const p of prog) {
            base[p.course_slug] = { percent: p.percent ?? 0, status: p.status ?? "enrolled", lastOpened: p.last_opened_at };
          }
        }
      } catch { /* table absent — enrollments fallback already in place */ }
      if (!cancelled) setProgress(base);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const allCourses = useMemo<UnifiedCourse[]>(
    () => [...certifiedToUnified(), ...community],
    [community],
  );
  const bySlug = useMemo(() => {
    const m = new Map<string, UnifiedCourse>();
    for (const c of allCourses) m.set(c.slug, c);
    return m;
  }, [allCourses]);

  // Continue Learning — enrolled courses, most-recently-opened first.
  const continueItems = useMemo<ContinueItem[]>(() => {
    if (!isAuthenticated) return [];
    const items: ContinueItem[] = [];
    for (const slug of enrolledSlugs) {
      const c = bySlug.get(slug);
      const p = progress[slug];
      if (!c) continue;
      items.push({ ...c, percent: p?.percent ?? 0, lastOpened: p?.lastOpened ?? "" });
    }
    return items.sort((a, b) => (b.lastOpened > a.lastOpened ? 1 : -1));
  }, [isAuthenticated, enrolledSlugs, bySlug, progress]);

  // Popular picks (Phase-1 stand-in for the personalized engine) — not enrolled,
  // a mix of high-rated official + most-enrolled community.
  const popular = useMemo<UnifiedCourse[]>(() => {
    const pool = allCourses.filter((c) => !enrolledSlugs.has(c.slug));
    return [...pool]
      .sort((a, b) => (b.rating ?? 0) * 100 + (b.enrolledCount ?? 0) - ((a.rating ?? 0) * 100 + (a.enrolledCount ?? 0)))
      .slice(0, 6);
  }, [allCourses, enrolledSlugs]);

  // ── Phase 2: personalized recommendations + learning path ──────────────
  const completedSlugs = useMemo(() => {
    const s = new Set<string>();
    for (const [slug, p] of Object.entries(progress)) {
      if (p.status === "completed" || p.percent >= 100) s.add(slug);
    }
    return s;
  }, [progress]);

  const learnerState = useMemo<LearnerState>(
    () => ({ completedSlugs, enrolledSlugs, strongAreas, weakAreas }),
    [completedSlugs, enrolledSlugs, strongAreas, weakAreas],
  );
  const recommendations = useMemo<Recommendation[]>(
    () => recommend(allCourses, learnerState),
    [allCourses, learnerState],
  );
  const pathSubject = useMemo(() => activeSubject(learnerState, allCourses), [learnerState, allCourses]);
  const path = useMemo<PathStep[]>(
    () => buildPath(pathSubject, deriveMastery(learnerState), allCourses),
    [pathSubject, learnerState, allCourses],
  );

  // Filtered library (search + subject).
  const filtered = useMemo<UnifiedCourse[]>(() => {
    return allCourses
      .filter((c) => (subject ? c.subject === subject : true))
      .map((c) => ({ c, s: searchScore(c, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (b.c.enrolledCount ?? 0) - (a.c.enrolledCount ?? 0))
      .map((x) => x.c);
  }, [allCourses, subject, query]);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-24">
        {/* ── Header ─────────────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-12"
        >
          <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-muted-foreground mb-3">Library</p>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">Courses</h1>
              <p className="text-sm text-muted-foreground mt-3 max-w-md">
                One library. Everything you're learning, and what to learn next.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 lg:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search courses, topics, skills…"
                  className="w-full pl-10 pr-9 py-2.5 rounded-md bg-secondary/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                  aria-label="Search courses"
                />
                {query && (
                  <button onClick={() => setQuery("")} aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <Link to="/build-course"
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-xs font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors elev-1">
                <Sparkles className="w-3.5 h-3.5" /> Build
              </Link>
            </div>
          </div>
        </motion.header>

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-16">
            {/* Search results take over when the user is searching/filtering. */}
            {query || subject ? (
              <Section
                title={subject ? subject : "Results"}
                count={filtered.length}
                action={
                  subject ? (
                    <button onClick={() => setSubject(null)}
                      className="inline-flex items-center gap-1 text-[11px] font-mono tracking-widest uppercase text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" /> Clear
                    </button>
                  ) : null
                }
              >
                {filtered.length === 0 ? (
                  <EmptyResults query={query} />
                ) : (
                  <Grid>{filtered.map((c) => <CourseCard key={c.slug} c={c} />)}</Grid>
                )}
              </Section>
            ) : (
              <>
                {/* ── Continue Learning ───────────────────────────── */}
                {continueItems.length > 0 && (
                  <Section title="Continue learning">
                    <Rail>
                      {continueItems.map((c) => <ContinueCard key={c.slug} c={c} />)}
                    </Rail>
                  </Section>
                )}

                {/* ── Recommended Next (personalized) or Popular (cold start) ── */}
                {recommendations.length > 0 ? (
                  <Section title="Recommended next" subtitle="Chosen from what you've learned — every pick has a reason">
                    <Rail>
                      {recommendations.map((r) => <RecCard key={r.course.slug} rec={r} />)}
                    </Rail>
                  </Section>
                ) : popular.length > 0 ? (
                  <Section title="Popular on Eclipta" subtitle="Get started with what learners are loving right now">
                    <Rail>
                      {popular.map((c) => <CourseCard key={c.slug} c={c} wide />)}
                    </Rail>
                  </Section>
                ) : null}

                {/* ── Your learning path (the progression spine) ──── */}
                {isAuthenticated && path.length > 0 && (
                  <Section title="Your learning path" subtitle={`${pathSubject} — where you are and what's next`}>
                    <LearningPathView steps={path} />
                  </Section>
                )}

                {/* ── Browse by subject ───────────────────────────── */}
                <Section title="Browse">
                  <div className="flex flex-wrap gap-2.5">
                    {SUBJECTS.map((s) => {
                      const n = allCourses.filter((c) => c.subject === s).length;
                      return (
                        <button
                          key={s}
                          onClick={() => setSubject(s)}
                          disabled={n === 0}
                          className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-md glass-panel text-sm transition-colors hover:border-primary/50 disabled:opacity-40 disabled:cursor-default"
                        >
                          <span className="font-medium">{s}</span>
                          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                </Section>

                {/* ── Full library ────────────────────────────────── */}
                <Section title="All courses" count={allCourses.length}>
                  <Grid>{allCourses.map((c) => <CourseCard key={c.slug} c={c} />)}</Grid>
                </Section>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Layout primitives ─────────────────────────────────────────────────── */

function Section({ title, subtitle, count, action, children }: {
  title: string; subtitle?: string; count?: number; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6, ease: EASE }}
    >
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight inline-flex items-baseline gap-2">
            {title}
            {typeof count === "number" && <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{count}</span>}
          </h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

/* ── Cards ─────────────────────────────────────────────────────────────── */

function SourceBadge({ source }: { source: UnifiedCourse["source"] }) {
  return source === "official" ? (
    <span className="inline-flex items-center gap-1 text-[9px] font-mono tracking-widest uppercase text-primary">
      <ShieldCheck className="w-3 h-3" /> Eclipta Official
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[9px] font-mono tracking-widest uppercase text-muted-foreground">
      <Users className="w-3 h-3" /> Community
    </span>
  );
}

/** A card links to the right detail route for its source. */
function DetailLink({ c, className, children }: { c: UnifiedCourse; className?: string; children: React.ReactNode }) {
  return c.source === "official" ? (
    <Link to="/certified/$slug" params={{ slug: c.slug }} className={className}>{children}</Link>
  ) : (
    <Link to="/courses/$slug" params={{ slug: c.slug }} className={className}>{children}</Link>
  );
}

function CourseCard({ c, wide }: { c: UnifiedCourse; wide?: boolean }) {
  return (
    <DetailLink
      c={c}
      className={`glass-panel rounded-md p-5 flex flex-col gap-3 group transition-colors hover:border-primary/50 snap-start ${wide ? "min-w-[280px] sm:min-w-[300px]" : ""}`}
    >
      {c.cover && (
        <img src={c.cover} alt="" loading="lazy"
          className="aspect-video w-full object-cover rounded-sm border border-border/50" />
      )}
      <div className="flex items-center justify-between gap-2">
        <SourceBadge source={c.source} />
        <span className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground">{c.level}</span>
      </div>
      <h3 className="font-display font-bold text-base leading-tight group-hover:text-primary transition-colors">{c.title}</h3>
      {c.summary && <p className="text-xs text-muted-foreground line-clamp-3 flex-1">{c.summary}</p>}
      <div className="flex items-center gap-3 pt-2 border-t border-border/40 text-[10px] text-muted-foreground tabular-nums">
        <span className="inline-flex items-center gap-1"><BookOpen className="w-3 h-3" /> {c.subject}</span>
        {typeof c.rating === "number" && <span className="inline-flex items-center gap-1 text-primary"><Star className="w-3 h-3 fill-primary" /> {c.rating}</span>}
        {typeof c.enrolledCount === "number" && <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {c.enrolledCount}</span>}
      </div>
    </DetailLink>
  );
}

function ContinueCard({ c }: { c: ContinueItem }) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <SourceBadge source={c.source} />
        <span className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground">
          {c.percent > 0 ? `${c.percent}%` : "Not started"}
        </span>
      </div>
      <h3 className="font-display font-bold text-base leading-tight group-hover:text-primary transition-colors">{c.title}</h3>
      {/* progress bar */}
      <div className="h-1 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${c.percent}%` }} />
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary mt-1">
        {c.percent > 0 ? "Continue" : "Start"} <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </>
  );
  // Continue routes to the player for official, the detail (which handles resume)
  // for community.
  return c.source === "official" ? (
    <Link to="/certified/$slug/learn" params={{ slug: c.slug }}
      className="glass-panel rounded-md p-5 flex flex-col gap-3 group transition-colors hover:border-primary/50 snap-start min-w-[260px] sm:min-w-[280px]">
      {inner}
    </Link>
  ) : (
    <Link to="/courses/$slug" params={{ slug: c.slug }}
      className="glass-panel rounded-md p-5 flex flex-col gap-3 group transition-colors hover:border-primary/50 snap-start min-w-[260px] sm:min-w-[280px]">
      {inner}
    </Link>
  );
}

function RecCard({ rec }: { rec: Recommendation }) {
  const { course, reason, readiness, kind } = rec;
  const pct = Math.round(readiness * 100);
  return (
    <DetailLink
      c={course}
      className="glass-panel rounded-md p-5 flex flex-col gap-3 group transition-colors hover:border-primary/50 snap-start min-w-[280px] sm:min-w-[300px]"
    >
      <div className="flex items-center justify-between gap-2">
        <SourceBadge source={course.source} />
        {kind === "remediation" ? (
          <span className="font-mono text-[9px] tracking-widest uppercase text-primary">Review first</span>
        ) : readiness < 1 ? (
          <span className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground tabular-nums">{pct}% ready</span>
        ) : null}
      </div>
      <h3 className="font-display font-bold text-base leading-tight group-hover:text-primary transition-colors">{course.title}</h3>
      <p className="text-xs text-primary/90 leading-snug flex items-start gap-1.5 flex-1">
        <Sparkles className="w-3 h-3 mt-0.5 shrink-0" /> <span>{reason}</span>
      </p>
      {readiness > 0 && readiness < 1 && (
        <div className="h-1 rounded-full bg-border overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary">
        Start <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </DetailLink>
  );
}

function LearningPathView({ steps }: { steps: PathStep[] }) {
  return (
    <div className="flex items-center overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {steps.map((s, i) => (
        <div key={s.concept.id} className="flex items-center shrink-0">
          <PathNode step={s} />
          {i < steps.length - 1 && (
            <div className={`h-px w-8 sm:w-10 shrink-0 ${s.state === "done" ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function PathNode({ step }: { step: PathStep }) {
  const { concept, state, course } = step;
  const dot =
    state === "done" ? <Check className="w-3.5 h-3.5 text-primary-foreground" />
    : state === "current" ? <CircleDot className="w-3.5 h-3.5 text-primary" />
    : state === "locked" ? <Lock className="w-3 h-3 text-muted-foreground" />
    : <Circle className="w-3 h-3 text-muted-foreground" />;
  const ring =
    state === "done" ? "bg-primary border-primary"
    : state === "current" ? "border-primary ring-2 ring-primary/25"
    : "border-border";
  const body = (
    <div className="flex flex-col items-center gap-1.5 w-[72px] text-center">
      <span className={`w-8 h-8 rounded-full border flex items-center justify-center ${ring}`}>{dot}</span>
      <span className={`text-[10px] leading-tight ${state === "locked" ? "text-muted-foreground" : "text-foreground"}`}>{concept.label}</span>
    </div>
  );
  return course && state !== "locked" ? (
    <DetailLink c={course} className="hover:opacity-80 transition-opacity">{body}</DetailLink>
  ) : body;
}

function EmptyResults({ query }: { query: string }) {
  return (
    <div className="glass-panel rounded-md p-12 text-center">
      <GraduationCap className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground mb-4">
        No courses match {query ? `“${query}”` : "that filter"} yet.
      </p>
      <Link to="/build-course"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold tracking-widest uppercase hover:bg-primary/90 transition-colors">
        <Sparkles className="w-3.5 h-3.5" /> Build this course
      </Link>
    </div>
  );
}
