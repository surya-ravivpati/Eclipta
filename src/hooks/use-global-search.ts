import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseQuery, type SearchKind, type ParsedQuery } from "@/lib/search/query";
import { globalSearch, type SearchHit } from "@/repositories/search";

/**
 * The search runtime.
 *
 * "Nearly instant" is mostly about what you *don't* do:
 *
 * - **Debounce, but short.** 120ms is under the ~150ms at which interaction
 *   stops feeling immediate, while still collapsing a burst of keystrokes into
 *   one query.
 * - **Keep the last results on screen while the next load runs.** Blanking the
 *   list on every keystroke is what makes search feel slow even when it is fast.
 * - **Cache by (needle, kinds).** Backspacing is the most common thing a user
 *   does in a search box, and it should be free.
 * - **Drop stale responses.** Without a sequence guard, a slow query for "phy"
 *   can land after a fast one for "physics" and overwrite it.
 */

const DEBOUNCE_MS = 120;
const MIN_LENGTH = 2;
const CACHE_MAX = 40;

export interface SearchState {
  query: string;
  setQuery: (q: string) => void;
  kinds: SearchKind[];
  toggleKind: (k: SearchKind) => void;
  clearKinds: () => void;
  results: SearchHit[];
  /** True while a request is in flight; results stay visible meanwhile. */
  loading: boolean;
  error: boolean;
  parsed: ParsedQuery;
  /** True when the query is too short to search. */
  idle: boolean;
}

export function useGlobalSearch(): SearchState {
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<SearchKind[]>([]);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const cache = useRef(new Map<string, SearchHit[]>());
  // Monotonic request id: only the newest response is allowed to win.
  const seq = useRef(0);

  const parsed = useMemo(() => parseQuery(query, kinds), [query, kinds]);
  const idle = parsed.needle.length < MIN_LENGTH;

  // Kinds the query resolved to — inferred from phrasing, or chosen by chip.
  const effectiveKinds = parsed.kinds;
  const cacheKey = `${parsed.needle}::${[...effectiveKinds].sort().join(",")}`;

  const toggleKind = useCallback((k: SearchKind) => {
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }, []);

  const clearKinds = useCallback(() => setKinds([]), []);

  useEffect(() => {
    if (idle) {
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }

    const cached = cache.current.get(cacheKey);
    if (cached) {
      setResults(cached);
      setLoading(false);
      setError(false);
      return;
    }

    const id = ++seq.current;
    setLoading(true);
    setError(false);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          // Synonym expansions are searched as a second pass and merged, rather
          // than OR-ed into one needle: a long OR-ed string dilutes every
          // trigram score, which would push exact matches down the list.
          const primary = await globalSearch(parsed.needle, effectiveKinds);
          let merged = primary;

          if (parsed.expansions.length > 0 && primary.length < 8) {
            const extra = await Promise.all(
              parsed.expansions
                .slice(0, 2)
                .map((term) => globalSearch(term, effectiveKinds, 8).catch(() => [])),
            );
            const seen = new Set(primary.map((h) => `${h.kind}:${h.id}`));
            for (const list of extra) {
              for (const hit of list) {
                const key = `${hit.kind}:${hit.id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                // A synonym hit is a weaker signal than a direct one, so it is
                // discounted before being merged into the same ranking.
                merged = [...merged, { ...hit, score: hit.score * 0.6 }];
              }
            }
            merged.sort((a, b) => b.score - a.score);
          }

          if (id !== seq.current) return; // a newer query already answered

          cache.current.set(cacheKey, merged);
          if (cache.current.size > CACHE_MAX) {
            const oldest = cache.current.keys().next().value;
            if (oldest !== undefined) cache.current.delete(oldest);
          }
          setResults(merged);
          setLoading(false);
        } catch {
          if (id !== seq.current) return;
          setError(true);
          setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // effectiveKinds is derived from `parsed`; cacheKey covers both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, idle]);

  return {
    query,
    setQuery,
    kinds,
    toggleKind,
    clearKinds,
    results,
    loading,
    error,
    parsed,
    idle,
  };
}
