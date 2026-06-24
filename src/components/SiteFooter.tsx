import { Link } from "@tanstack/react-router";
import { Github, Mail } from "lucide-react";
import { BrandLockup } from "@/components/BrandLockup";

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
            <Link to="/" className="inline-flex" aria-label="Eclipta home">
              <BrandLockup size="sm" />
            </Link>
            <p className="text-xs text-muted-foreground mt-4 leading-relaxed max-w-xs">
              An adaptive learning arena. Battles, trophies, and AI guidance for serious learners.
            </p>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-3">
                {group.label}
              </p>
              <ul className="space-y-2">
                {group.links.map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="text-xs text-foreground/75 hover:text-foreground transition-colors"
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
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
            © {new Date().getFullYear()} Eclipta
          </p>
          <div className="flex items-center gap-3">
            <a
              href="mailto:hello@eclipta.app"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Contact"
            >
              <Mail className="w-4 h-4" />
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
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
