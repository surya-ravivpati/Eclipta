/**
 * Account-level block list. Blocking is a personal social preference (not a
 * room setting), so the set is loaded once per signed-in user and can be
 * consumed by ANY chat surface to hide a blocked person's messages app-wide.
 *
 * Study-room chat consumes it today; other chat surfaces can adopt the same
 * hook without re-querying or re-modelling blocking.
 */
import { useCallback, useEffect, useState } from "react";
import {
  fetchBlockedUserIds,
  blockUser as blockRpc,
  unblockUser as unblockRpc,
} from "@/lib/study-safety";

export function useBlockedUsers() {
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setBlocked(await fetchBlockedUserIds());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const block = useCallback(
    async (id: string) => {
      setBlocked((prev) => new Set(prev).add(id)); // optimistic
      const err = await blockRpc(id);
      if (err) {
        await refresh();
        return err;
      }
      return null;
    },
    [refresh],
  );

  const unblock = useCallback(
    async (id: string) => {
      setBlocked((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      const err = await unblockRpc(id);
      if (err) {
        await refresh();
        return err;
      }
      return null;
    },
    [refresh],
  );

  const isBlocked = useCallback(
    (id: string | null | undefined) => !!id && blocked.has(id),
    [blocked],
  );

  return { blocked, loaded, isBlocked, block, unblock, refresh };
}
