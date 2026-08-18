import { skipToken, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getClaimedChestNodeIds } from "@/repositories/profile";
import { emoteRoster, ownedEmotes } from "@/lib/emotes";
import type { Emote } from "@/config/emotes";
import type { RoadNode } from "@/lib/trophy-road-data";

/**
 * The emotes this player has unlocked, and the ones they have not.
 *
 * Reads the claimed chests and derives from them - see `lib/emotes.ts` for why
 * there is no inventory table. Cached by TanStack Query, because a battle asks
 * for this every time the picker opens and the answer only changes when a
 * chest is opened on a different page.
 */
/**
 * Exported so the Trophy Road can invalidate it the moment a chest is opened.
 * Without that the new emote sits behind `staleTime` and the player, who just
 * watched a toast say it was theirs, finds it locked in their next battle.
 */
export function claimedChestsQueryKey(userId: string) {
  return ["claimed-chests", userId] as const;
}

export function useOwnedEmotes(): {
  owned: Emote[];
  roster: { emote: Emote; owned: boolean; from: RoadNode | null }[];
  loading: boolean;
} {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: user ? claimedChestsQueryKey(user.id) : ["claimed-chests", "signed-out"],
    queryFn: user ? () => getClaimedChestNodeIds(user.id) : skipToken,
    // Opening a chest is a deliberate act on another page; there is no need to
    // re-ask on every window focus during a battle.
    staleTime: 5 * 60 * 1000,
  });

  const claimed = query.data ?? [];
  return {
    owned: ownedEmotes(claimed),
    roster: emoteRoster(claimed),
    loading: user ? query.isLoading : false,
  };
}
