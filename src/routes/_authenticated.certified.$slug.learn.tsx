import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Check, CircleDot, Menu, X, BookOpen,
  PlayCircle, MessagesSquare, Trophy, Lightbulb,
} from "lucide-react";
import { getCourseBySlug, type CertifiedCourse } from "@/lib/certified-courses";
import { useAuth } from "@/hooks/use-auth";
import { syncCourseProgress } from "@/lib/course-progress";
import { z } from "zod";

/* ---------------- Route ---------------- */

const searchSchema = z.object({
  m: z.coerce.number().int().min(0).optional(),
  l: z.coerce.number().int().min(0).optional(),
});

export const Route = createFileRoute("/_authenticated/certified/$slug/learn")({
  validateSearch: (s) => searchSchema.parse(s),
  loader: ({ params }) => {
    const course = getCourseBySlug(params.slug);
    if (!course) throw notFound();
    return { course };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Learn: ${loaderData?.course.title ?? "Course"} – Eclipta` },
      { name: "description", content: `Course player for ${loaderData?.course.title ?? "this course"}.` },
    ],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <Link to="/courses" className="text-neon-purple">← Back to courses</Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">{error.message}</div>
  ),
  component: CoursePlayer,
});

/* ---------------- Helpers ---------------- */

type Lesson = { moduleIdx: number; lessonIdx: number; moduleTitle: string; lessonTitle: string };

function flattenLessons(course: CertifiedCourse): Lesson[] {
  const out: Lesson[] = [];
  course.syllabus.forEach((mod, mi) => {
    mod.lessons.forEach((title, li) => {
      out.push({ moduleIdx: mi, lessonIdx: li, moduleTitle: mod.title, lessonTitle: title });
    });
  });
  return out;
}

function lessonKey(slug: string, m: number, l: number) {
  return `eclipta:lesson:${slug}:${m}:${l}`;
}

function loadCompletion(slug: string, lessons: Lesson[]): Set<string> {
  if (typeof window === "undefined") return new Set();
  const out = new Set<string>();
  lessons.forEach(({ moduleIdx, lessonIdx }) => {
    if (localStorage.getItem(lessonKey(slug, moduleIdx, lessonIdx)) === "1") {
      out.add(`${moduleIdx}:${lessonIdx}`);
    }
  });
  return out;
}

/**
 * Synthesize lesson body from titles. These are seed/fake courses so we don't
 * have hand-written content; build a useful scaffold (overview, key ideas,
 * exercise prompt) from the metadata so the player feels real.
 */
function lessonContent(course: CertifiedCourse, lesson: Lesson): {
  overview: string;
  keyIdeas: string[];
  exercise: string;
} {
  const { lessonTitle, moduleTitle } = lesson;
  return {
    overview:
      `In this lesson we focus on **${lessonTitle}** within the broader topic of ${moduleTitle}. ` +
      `By the end you'll be able to recognize when ${lessonTitle.toLowerCase()} matters in the field of ` +
      `${course.title.toLowerCase()}, and apply it to a small worked example.`,
    keyIdeas: [
      `Why ${lessonTitle} fits inside ${moduleTitle}`,
      `The core mental model behind ${lessonTitle}`,
      `One worked example you can replicate yourself`,
      `A common pitfall to avoid`,
    ],
    exercise:
      `Pick one small problem in your own notes that touches ${lessonTitle.toLowerCase()}. ` +
      `Write down the question, your first instinct, then the answer you get after applying ` +
      `what you just learned. Bring it into the course forum if you want feedback.`,
  };
}

/* ---------------- Player ---------------- */

function CoursePlayer() {
  const { course } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();

  const lessons = useMemo(() => flattenLessons(course), [course]);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load completion from localStorage on mount.
  useEffect(() => {
    setCompleted(loadCompletion(course.slug, lessons));
  }, [course.slug, lessons]);

  const currentIndex = useMemo(() => {
    const m = search.m ?? 0;
    const l = search.l ?? 0;
    const idx = lessons.findIndex(x => x.moduleIdx === m && x.lessonIdx === l);
    return idx === -1 ? 0 : idx;
  }, [lessons, search.m, search.l]);

  const lesson = lessons[currentIndex];
  const content = useMemo(() => lessonContent(course, lesson), [course, lesson]);
  const totalLessons = lessons.length;
  const completedCount = completed.size;
  const pct = Math.round((completedCount / totalLessons) * 100);
  const isDone = completed.has(`${lesson.moduleIdx}:${lesson.lessonIdx}`);
  const goTo = (idx: number) => {
    const target = lessons[idx];
    if (!target) return;
    navigate({
      to: "/certified/$slug/learn",
      params: { slug: course.slug },
      search: { m: target.moduleIdx, l: target.lessonIdx },
    });
    setSidebarOpen(false);
  };

  const markComplete = () => {
    const k = `${lesson.moduleIdx}:${lesson.lessonIdx}`;
    if (typeof window !== "undefined") {
      localStorage.setItem(lessonKey(course.slug, lesson.moduleIdx, lesson.lessonIdx), "1");
    }
    setCompleted(prev => new Set(prev).add(k));
  };

  const next = () => {
    if (!isDone) markComplete();
    if (currentIndex < totalLessons - 1) goTo(currentIndex + 1);
  };

  const isCourseComplete = completedCount === totalLessons && totalLessons > 0;

  // Mirror progress into course_progress so the Courses hub's Continue Learning
  // can resume this course. Best-effort; localStorage stays the player's own
  // source of truth.
  useEffect(() => {
    if (!user) return;
    void syncCourseProgress({
      userId: user.id,
      courseSlug: course.slug,
      courseTitle: course.title,
      source: "official",
      lessonsDone: completedCount,
      lessonsTotal: totalLessons,
      currentBlockId: `${lesson.moduleIdx}:${lesson.lessonIdx}`,
    });
  }, [user, course.slug, course.title, completedCount, totalLessons, lesson.moduleIdx, lesson.lessonIdx]);

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">

      {/* Mobile sidebar trigger */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-30 px-4 py-3 bg-neon-purple text-primary-foreground text-xs font-bold tracking-widest shadow-lg flex items-center gap-2"
      >
        <Menu className="w-4 h-4" /> SYLLABUS
      </button>

      <div className="pt-20 max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar */}
        <aside
          className={`${sidebarOpen ? "fixed inset-0 z-40 bg-background/95 backdrop-blur-xl overflow-y-auto pt-20 px-6" : "hidden"} lg:block lg:relative lg:inset-auto lg:bg-transparent lg:backdrop-blur-none lg:pt-4 lg:px-0`}
        >
          {sidebarOpen && (
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden absolute top-4 right-4 p-2 text-foreground">
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="lg:sticky lg:top-20">
            <Link
              to="/certified/$slug"
              params={{ slug: course.slug }}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground hover:text-neon-purple mb-4"
            >
              <ArrowLeft className="w-3 h-3" /> COURSE OVERVIEW
            </Link>

            <h2 className="font-display font-bold text-base tracking-tight mb-1 leading-tight">{course.title}</h2>
            <p className="text-[10px] text-muted-foreground mb-3">by {course.creator}</p>

            {/* Progress bar */}
            <div className="mb-2 flex items-center justify-between text-[10px] tracking-widest font-bold text-muted-foreground">
              <span>PROGRESS</span>
              <span className="text-neon-purple tabular-nums">{completedCount}/{totalLessons}</span>
            </div>
            <div className="w-full h-1.5 bg-secondary/50 mb-5 overflow-hidden">
              <div
                className="h-full bg-neon-purple transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>

            <Link
              to="/certified/$slug/forum"
              params={{ slug: course.slug }}
              className="mb-5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold tracking-widest border border-neon-pink/40 text-neon-pink hover:bg-neon-pink/10 transition-colors"
            >
              <MessagesSquare className="w-3 h-3" /> COURSE FORUM
            </Link>

            <nav className="space-y-4">
              {course.syllabus.map((mod: { title: string; lessons: string[] }, mi: number) => (
                <div key={mod.title}>
                  <p className="text-[10px] font-bold tracking-widest text-neon-purple/80 mb-1.5">
                    {String(mi + 1).padStart(2, "0")} · {mod.title.toUpperCase()}
                  </p>
                  <ul className="space-y-0.5">
                    {mod.lessons.map((title: string, li: number) => {
                      const idx = lessons.findIndex(x => x.moduleIdx === mi && x.lessonIdx === li);
                      const active = idx === currentIndex;
                      const done = completed.has(`${mi}:${li}`);
                      return (
                        <li key={title}>
                          <button
                            onClick={() => goTo(idx)}
                            className={`w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs transition-colors ${
                              active
                                ? "bg-neon-purple/15 text-neon-purple border-l-2 border-neon-purple"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary/30 border-l-2 border-transparent"
                            }`}
                          >
                            {done ? (
                              <Check className="w-3 h-3 text-neon-cyan shrink-0" />
                            ) : active ? (
                              <CircleDot className="w-3 h-3 shrink-0" />
                            ) : (
                              <span className="w-3 h-3 rounded-full border border-border shrink-0" />
                            )}
                            <span className="leading-tight">{title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main lesson pane */}
        <main className="pb-24">
          <motion.div
            key={`${lesson.moduleIdx}:${lesson.lessonIdx}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p className="text-[10px] font-bold tracking-widest text-neon-purple/70 mb-2">
              MODULE {String(lesson.moduleIdx + 1).padStart(2, "0")} · LESSON {String(lesson.lessonIdx + 1).padStart(2, "0")}
            </p>
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight leading-tight mb-1">
              {lesson.lessonTitle}
            </h1>
            <p className="text-sm text-muted-foreground mb-8">{lesson.moduleTitle}</p>

            {/* "Video" placeholder — represents the lesson stage */}
            <div className="aspect-video w-full glass-panel mb-8 flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-neon-purple/10 via-transparent to-neon-pink/10" />
              <div className="relative text-center px-6">
                <BookOpen className="w-12 h-12 text-neon-purple mx-auto mb-3 opacity-80" />
                <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  Written Lesson
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  An auto-generated study outline for "{lesson.lessonTitle}" — read it below. Video walkthroughs aren't available yet.
                </p>
              </div>
            </div>

            {/* Overview */}
            <section className="mb-8 glass-panel p-6">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-neon-purple" />
                <h2 className="text-xs font-bold tracking-widest text-neon-purple">OVERVIEW</h2>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{content.overview}</p>
            </section>

            {/* Key ideas */}
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-neon-cyan" />
                <h2 className="text-xs font-bold tracking-widest text-neon-cyan">KEY IDEAS</h2>
              </div>
              <ul className="space-y-2">
                {content.keyIdeas.map((k, i) => (
                  <li key={k} className="flex items-start gap-3 glass-panel p-4">
                    <span className="text-neon-cyan font-display font-bold text-sm tabular-nums shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm leading-relaxed">{k}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Exercise */}
            <section className="mb-10 glass-panel p-6 border border-neon-pink/20">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-neon-pink" />
                <h2 className="text-xs font-bold tracking-widest text-neon-pink">YOUR TURN</h2>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{content.exercise}</p>
            </section>

            {/* Nav controls */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between border-t border-border pt-6">
              <button
                onClick={() => goTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="px-5 py-2.5 text-xs font-bold tracking-widest border border-border text-muted-foreground hover:border-neon-purple/40 hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:border-border inline-flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-3 h-3" /> PREVIOUS
              </button>

              <div className="flex gap-2">
                {!isDone && (
                  <button
                    onClick={markComplete}
                    className="px-5 py-2.5 text-xs font-bold tracking-widest border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <Check className="w-3 h-3" /> MARK COMPLETE
                  </button>
                )}
                <button
                  onClick={next}
                  disabled={currentIndex === totalLessons - 1 && isDone}
                  className="px-5 py-2.5 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
                >
                  {currentIndex === totalLessons - 1
                    ? (isDone ? "ALL DONE" : "FINISH COURSE")
                    : (isDone ? "NEXT LESSON" : "COMPLETE & NEXT")}
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {isCourseComplete && (
              <div className="mt-8 glass-panel p-6 text-center border border-neon-cyan/40">
                <Trophy className="w-8 h-8 text-neon-cyan mx-auto mb-3" />
                <h3 className="font-display font-bold text-lg mb-1">Course complete</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  You've worked through every lesson in {course.title}. Take what you learned into the arena.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Link
                    to="/certified/$slug/forum"
                    params={{ slug: course.slug }}
                    className="px-5 py-2 text-xs font-bold tracking-widest border border-neon-pink/40 text-neon-pink hover:bg-neon-pink/10 transition-colors"
                  >
                    SHARE IN COURSE FORUM
                  </Link>
                  <Link
                    to="/battles"
                    className="px-5 py-2 text-xs font-bold tracking-widest bg-neon-purple text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    TRY A BATTLE
                  </Link>
                </div>
              </div>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}