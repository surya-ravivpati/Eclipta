import { Link } from "@tanstack/react-router";
import { Github, Mail } from "lucide-react";

const FOOTER_GROUPS = [
  {
    label: "LEARN",
    links: [
      { to: "/certified", label: "Certified Courses" },
      { to: "/build-course", label: "Build a Course" },
      { to: "/luna", label: "Luna Tutor" },
    ],
  },
  {
    label: "PRACTICE",
    links: [
      { to: "/adaptive-tests", label: "Adaptive Tests" },
      { to: "/battles", label: "Knowledge Battles" },
      { to: "/progress", label: "Trophy Road" },
    ],
  },
  {
    label: "COMMUNITY",
    links: [
      { to: "/forum", label: "Forum" },
      { to: "/about", label: "About" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background/60 mt-16">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="text-2xl font-bold tracking-tighter text-neon-purple font-display">
              ECLIPTA
            </Link>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed max-w-xs">
              An adaptive learning arena. Battles, trophies, and AI guidance for serious learners.
            </p>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-3">
                {group.label}
              </p>
              <ul className="space-y-2">
                {group.links.map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="text-xs text-foreground/80 hover:text-neon-purple transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-border">
          <p className="text-[11px] text-muted-foreground tracking-wide">
            © {new Date().getFullYear()} Eclipta. Built for learners who want more.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="mailto:hello@eclipta.app"
              className="text-muted-foreground hover:text-neon-purple transition-colors"
              aria-label="Contact"
            >
              <Mail className="w-4 h-4" />
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-neon-purple transition-colors"
              aria-label="GitHub"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
