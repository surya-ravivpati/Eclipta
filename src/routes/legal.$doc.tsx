import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { LEGAL_DOCUMENTS, getLegalDocument } from "@/content/legal/documents";
import { LEGAL_CONTACT } from "@/content/legal/types";

export const Route = createFileRoute("/legal/$doc")({
  loader: ({ params }) => {
    const doc = getLegalDocument(params.doc);
    // notFound() returns a router sentinel that is meant to be thrown from a
    // loader. The rule knows the type is allowed - see eslint.config.js.
    if (!doc) throw notFound();
    return doc;
  },
  component: LegalPage,
});

function LegalPage() {
  const doc = Route.useLoaderData();

  return (
    <div className="min-h-screen pt-24 pb-20 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Sibling policies stay reachable: someone reading the Privacy Policy
            is often looking for the Cookie Policy and should not have to go
            back to the footer to find it. */}
        <nav aria-label="Policies" className="mb-10">
          <ul className="flex flex-wrap gap-2">
            {LEGAL_DOCUMENTS.map((d) => (
              <li key={d.slug}>
                <Link
                  to="/legal/$doc"
                  params={{ doc: d.slug }}
                  aria-current={d.slug === doc.slug ? "page" : undefined}
                  className={`inline-block px-2.5 py-1 rounded-full border text-[11px] transition-colors ${
                    d.slug === doc.slug
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <header className="mb-8">
          <h1 className="text-4xl font-display font-bold tracking-tight mb-2">{doc.title}</h1>
          <p className="text-muted-foreground">{doc.summary}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Last updated <time>{doc.lastUpdated}</time>
          </p>
        </header>

        {/* A draft policy must say so on its face. Presenting an unreviewed
            document as a binding one is worse than having none. */}
        {doc.draft && (
          <div
            role="note"
            className="mb-10 flex gap-3 p-4 rounded-lg border border-primary/40 bg-primary/5"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-foreground mb-1">Draft - pending legal review</p>
              <p className="text-sm text-muted-foreground">
                This document has been prepared to describe how Eclipta actually works, but it has
                not yet been reviewed by qualified counsel and should not be relied on as a final
                statement of your rights or ours. Questions:{" "}
                <a
                  href={`mailto:${LEGAL_CONTACT}`}
                  className="underline active:scale-[0.97] hover:opacity-90"
                >
                  {LEGAL_CONTACT}
                </a>
                .
              </p>
            </div>
          </div>
        )}

        <article className="space-y-9">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-display font-bold mb-3">{section.heading}</h2>
              {section.body.map((p, i) => (
                <p key={i} className="text-[15px] leading-7 text-muted-foreground mb-3">
                  {p}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-2 space-y-2 pl-5 list-disc">
                  {section.bullets.map((b, i) => (
                    <li key={i} className="text-[15px] leading-7 text-muted-foreground">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
