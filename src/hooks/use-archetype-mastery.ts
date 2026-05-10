import { useEffect, useRef, useState } from "react";
import { fetchAllMastery, emptyMastery, type ArchetypeMastery } from "@/lib/archetype-mastery";
import type { ArchetypeId } from "@/components/battles/types";

const ALL_ARCHETYPES: ArchetypeId[] = [
  "speedster", "tank", "chud", "gambler",
  "healer", "fulcrum", "accelerator", "god",
];

type MasteryMap = Record<ArchetypeId, ArchetypeMastery>;

function buildEmpty(): MasteryMap {
  return Object.fromEntries(
    ALL_ARCHETYPES.map(id => [id, emptyMastery(id)])
  ) as MasteryMap;
}

/**
 * Fetches mastery for all archetypes and returns a keyed lookup.
 * Used by ClassSelectDialog to show rank badges without individual queries.
 */
export function useArchetypeMastery(): {
  mastery: MasteryMap;
  loading: boolean;
  refresh: () => void;
} {
  const [mastery, setMastery] = useState<MasteryMap>(buildEmpty);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    setLoading(true);
    fetchAllMastery().then(rows => {
      if (cancelRef.current) return;
      const map = buildEmpty();
      rows.forEach(r => {
        if (r.archetype in map) {
          map[r.archetype as ArchetypeId] = r;
        }
      });
      setMastery(map);
      setLoading(false);
    });
    return () => { cancelRef.current = true; };
  }, [tick]);

  return { mastery, loading, refresh: () => setTick(t => t + 1) };
}
