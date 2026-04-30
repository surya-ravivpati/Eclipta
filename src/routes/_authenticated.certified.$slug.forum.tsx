import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Forum } from "@/components/Forum";
import { getCourseBySlug } from "@/lib/certified-courses";

export const Route = createFileRoute("/_authenticated/certified/$slug/forum")({
  loader: ({ params }) => {
    const course = getCourseBySlug(params.slug);
    if (!course) throw notFound();
    return { course };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.course.title ?? "Course"} – Forum – Eclipta` },
      { name: "description", content: `Discussion threads for ${loaderData?.course.title ?? "this course"} — ask, answer, share insights.` },
    ],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <Link to="/certified" className="text-neon-purple">← Back to courses</Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">{error.message}</div>
  ),
  component: CourseForumPage,
});

function CourseForumPage() {
  const { course } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Navbar />
      <div className="pt-24 px-6 max-w-5xl mx-auto">
        <Link
          to="/certified/$slug"
          params={{ slug: course.slug }}
          className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground hover:text-neon-purple"
        >
          <ArrowLeft className="w-3 h-3" /> BACK TO {course.title.toUpperCase()}
        </Link>
      </div>
      <Forum
        defaultCourse={course.title}
        lockCourse
        heading={<>{course.title} <span className="text-neon-pink">Forum</span></>}
        subheading={`Course-specific discussion for ${course.title}. Ask questions, post answers, help peers.`}
      />
    </div>
  );
}