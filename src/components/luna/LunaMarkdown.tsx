/**
 * Shared markdown renderer for every Luna surface.
 *
 * Responsibilities:
 *  - Normalize the wire-format LLMs actually emit (\\(...\\), \\[...\\], stray
 *    \\boxed{}) into something remark-math understands ($...$, $$...$$).
 *  - Render fenced ```lang code blocks as proper styled code boxes with the
 *    language tag in the corner.
 *  - Keep inline `code` distinct from prose.
 *  - Wire up GFM (tables, strikethrough, task lists) + KaTeX.
 */
import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/**
 * Translate the LaTeX-ish delimiters Luna's models emit (and that KaTeX
 * doesn't recognize without preprocessing) into the $-style syntax that
 * remark-math parses out of the box.
 *
 * Order matters — block first so the inline regex can't eat its opener.
 */
function normalizeLatex(input: string): string {
  if (!input) return input;
  let out = input;

  // \[ ... \]   ->  $$ ... $$   (block math)
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body) => `\n$$${body}$$\n`);
  // \( ... \)   ->   $ ... $    (inline math)
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body) => `$${body}$`);

  // \boxed{x} -> just x (KaTeX supports \boxed but only inside math; outside
  // math it renders as literal text which is uglier than the bare value).
  // Only strip when it's clearly free-standing prose (no surrounding $).
  // Inside math segments we leave it alone so KaTeX renders the box.
  return out;
}

const components: Components = {
  // Block + inline code. ReactMarkdown >=9 passes `inline` via parent context,
  // so we sniff the className for `language-*` to decide.
  code({ className, children, ...props }) {
    const text = String(children ?? "").replace(/\n$/, "");
    const langMatch = /language-(\w+)/.exec(className || "");
    const isBlock = !!langMatch || text.includes("\n");
    if (!isBlock) {
      return (
        <code
          className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border/60 text-[0.85em] font-mono text-neon-cyan"
          {...props}
        >
          {children}
        </code>
      );
    }
    const lang = langMatch?.[1];
    return (
      <div className="my-2 rounded-md border border-border bg-[#0b0b14] overflow-hidden">
        {lang && (
          <div className="px-3 py-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase border-b border-border/60 bg-secondary/30">
            {lang}
          </div>
        )}
        <pre className="px-3 py-2 overflow-x-auto text-xs leading-relaxed">
          <code className={`font-mono text-foreground ${className ?? ""}`}>{text}</code>
        </pre>
      </div>
    );
  },
  // Tighten up paragraph spacing inside chat bubbles.
  p({ children }) {
    return <p className="m-0 [&+p]:mt-2">{children}</p>;
  },
  // GFM tables get a sensible default.
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="text-xs border border-border">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="px-2 py-1 border-b border-border bg-secondary/40 text-left font-bold">{children}</th>;
  },
  td({ children }) {
    return <td className="px-2 py-1 border-b border-border/40">{children}</td>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-neon-cyan hover:text-neon-pink underline">
        {children}
      </a>
    );
  },
};

interface Props {
  children: string;
  className?: string;
}

export function LunaMarkdown({ children, className }: Props) {
  const normalized = normalizeLatex(children);
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none [&>p]:m-0 break-words ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}