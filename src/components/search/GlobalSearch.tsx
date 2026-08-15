import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  GraduationCap,
  MessageSquare,
  Search,
  Swords,
  TrendingUp,
  User,
  Users,
  X,
  Clock,
  StickyNote,
  Loader2,
} from "lucide-react";
import { useGlobalSearch } from "@/hooks/use-global-search";
import { ALL_KINDS, highlight, type SearchKind } from "@/lib/search/query";
import {
  clearRecentSearches,
  getRecentSearches,
  getTrendingSearches,
  recordSearch,
  type SearchHit,
} from "@/repositories/search";
import { useTranslation } from "@/i18n/use-translation";
import { announce } from "@/lib/a11y";
import { cn } from "@/lib/utils";
import { formatShortcut } from "@/lib/platform";

/**
 * Global search palette (⌘K / Ctrl+K).
 *
 * Built as a listbox rather than a menu: the input keeps focus while the arrow
 * keys move a *virtual* cursor via `aria-activedescendant`. That is the pattern
 * screen readers expect from a combobox, and it means the user never has to
 * tab away from the field to reach a result.
 */

const KIND_ICON: Record<SearchKind, typeof Search> = {
  course: GraduationCap,
  lesson: BookOpen,
  thread: MessageSquare,
  user: User,
  group: Users,
  battle: Swords,
  note: StickyNote,
};

export function GlobalSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const search = useGlobalSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [cursor, setCursor] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  // Computed client-side only — the server has no OS to detect, and a
  // hydration mismatch on <kbd> text is worse than a one-frame default.
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl+K");
  useEffect(() => {
    setShortcutLabel(formatShortcut("K"));
  }, []);

  // ⌘K / Ctrl+K anywhere, and Escape to leave. Bound on the window so the
  // shortcut works regardless of where focus currently sits.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load the zero-state content when the palette opens, not on mount — no
  // reason to spend two requests on a palette the user may never open.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    void getRecentSearches(6)
      .then((r) => setRecents(r.map((x) => x.query)))
      .catch(() => setRecents([]));
    void getTrendingSearches(5)
      .then((r) => setTrending(r.map((x) => x.query)))
      .catch(() => setTrending([]));
  }, [open]);

  const results = search.results;

  useEffect(() => setCursor(0), [search.parsed.needle, search.kinds]);

  // Result counts are invisible to a screen reader otherwise — the list simply
  // changes underneath them.
  useEffect(() => {
    if (!open || search.idle || search.loading) return;
    announce(
      results.length === 0
        ? t("search.noResults", { query: search.parsed.raw })
        : t("search.resultCount", { count: results.length }),
    );
  }, [open, results.length, search.idle, search.loading, search.parsed.raw, t]);

  const close = useCallback(() => {
    setOpen(false);
    search.setQuery("");
    search.clearKinds();
  }, [search]);

  const choose = useCallback(
    (hit: SearchHit) => {
      // Record what they picked, not just what they typed: a search that ended
      // in a click is the signal worth keeping.
      recordSearch(search.parsed.raw, hit.kind, hit.id);
      close();
      void navigate({ to: hit.url });
    },
    [close, navigate, search.parsed.raw],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + results.length) % results.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setCursor(results.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[cursor];
      if (hit) choose(hit);
    }
  }

  // Keep the virtual cursor in view when it moves past the visible window.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // Group by kind so the eye can skip to a section instead of reading a
  // flat list, while ranking still decides the order within each group.
  const grouped = useMemo(() => {
    const out = new Map<SearchKind, { hit: SearchHit; index: number }[]>();
    results.forEach((hit, index) => {
      const list = out.get(hit.kind) ?? [];
      list.push({ hit, index });
      out.set(hit.kind, list);
    });
    return [...out.entries()];
  }, [results]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="text-xs">{t("search.open")}</span>
        <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded border border-border">
          {shortcutLabel}
        </kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("search.title")}
    >
      {/* Clicking away closes; the backdrop is not a control, so it is hidden
          from assistive tech and Escape is the keyboard equivalent. */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-2xl glass-panel border border-border rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {search.loading ? (
            <Loader2
              className="w-4 h-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <Search className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="search-results"
            aria-activedescendant={results.length > 0 ? `search-hit-${cursor}` : undefined}
            aria-label={t("search.title")}
            autoComplete="off"
            spellCheck={false}
            value={search.query}
            onChange={(e) => search.setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("search.placeholder")}
            className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={close}
            aria-label={t("a11y.closeDialog")}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Filters. Pressed state carries the icon+label, never colour alone. */}
        <div
          className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-border"
          role="group"
          aria-label={t("search.filters")}
        >
          {ALL_KINDS.map((kind) => {
            const Icon = KIND_ICON[kind];
            const active = search.kinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={active}
                onClick={() => search.toggleKind(kind)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] transition-colors",
                  active
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                {t(`search.kind.${kind}`)}
              </button>
            );
          })}
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {/* Zero state: recents and trending, which are the two things a user
              most often wants when they open a search box with no query. */}
          {search.idle && (
            <div className="p-4 space-y-4">
              {recents.length > 0 && (
                <Suggestions
                  icon={Clock}
                  label={t("search.recent")}
                  items={recents}
                  onPick={search.setQuery}
                  action={{
                    label: t("search.clearRecent"),
                    onClick: () => {
                      void clearRecentSearches().then(() => setRecents([]));
                    },
                  }}
                />
              )}
              {trending.length > 0 && (
                <Suggestions
                  icon={TrendingUp}
                  label={t("search.trending")}
                  items={trending}
                  onPick={search.setQuery}
                />
              )}
              {recents.length === 0 && trending.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("search.hint")}</p>
              )}
            </div>
          )}

          {!search.idle && search.error && (
            <p className="p-4 text-sm text-muted-foreground">{t("common.error")}</p>
          )}

          {!search.idle && !search.error && results.length === 0 && !search.loading && (
            <p className="p-4 text-sm text-muted-foreground">
              {t("search.noResults", { query: search.parsed.raw })}
            </p>
          )}

          {results.length > 0 && (
            <ul id="search-results" ref={listRef} role="listbox" aria-label={t("search.title")}>
              {grouped.map(([kind, items]) => (
                <li key={kind} role="presentation">
                  <p
                    className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground"
                    id={`search-group-${kind}`}
                  >
                    {t(`search.kind.${kind}`)}
                  </p>
                  <ul role="group" aria-labelledby={`search-group-${kind}`}>
                    {items.map(({ hit, index }) => (
                      <Row
                        key={`${hit.kind}-${hit.id}`}
                        hit={hit}
                        index={index}
                        active={index === cursor}
                        needle={search.parsed.needle}
                        onChoose={choose}
                        onHover={setCursor}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span>↑↓ {t("search.navigate")}</span>
          <span>↵ {t("search.select")}</span>
          <span>esc {t("common.close")}</span>
        </div>
      </div>
    </div>
  );
}

function Row({
  hit,
  index,
  active,
  needle,
  onChoose,
  onHover,
}: {
  hit: SearchHit;
  index: number;
  active: boolean;
  needle: string;
  onChoose: (h: SearchHit) => void;
  onHover: (i: number) => void;
}) {
  const { t } = useTranslation();
  const Icon = KIND_ICON[hit.kind];
  return (
    <li
      id={`search-hit-${index}`}
      data-index={index}
      role="option"
      aria-selected={active}
      onClick={() => onChoose(hit)}
      onMouseEnter={() => onHover(index)}
      className={cn(
        "flex items-start gap-3 px-4 py-2.5 cursor-pointer",
        active && "bg-secondary/60",
      )}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground truncate">
          {highlight(hit.title, needle).map((seg, i) =>
            seg.match ? (
              // <mark> rather than a coloured span: it carries meaning to
              // assistive tech and survives forced-colors mode.
              <mark key={i} className="bg-primary/25 text-foreground rounded-sm px-0.5">
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
        {hit.subtitle && (
          <p className="text-[11px] text-muted-foreground truncate">{hit.subtitle}</p>
        )}
      </div>
      {hit.personal && (
        <span className="shrink-0 text-[9px] font-bold tracking-widest text-primary uppercase mt-1">
          {t("search.yours")}
        </span>
      )}
    </li>
  );
}

function Suggestions({
  icon: Icon,
  label,
  items,
  onPick,
  action,
}: {
  icon: typeof Search;
  label: string;
  items: string[];
  onPick: (q: string) => void;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
          <Icon className="w-3 h-3" aria-hidden="true" />
          {label}
        </p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            {action.label}
          </button>
        )}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="px-2.5 py-1 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
