import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { EMOTES } from "@/config/emotes";
import { nodeForEmote } from "@/lib/emotes";

/**
 * A thin wrapper over one query, so what is worth checking is the wiring: that
 * a signed-out visitor is never asked about, that the claims are turned into
 * emotes rather than passed through, and that a failed fetch reads as "no
 * emotes yet" instead of throwing into a battle screen.
 */

const getClaimedChestNodeIds = vi.fn<(id: string) => Promise<number[]>>();
let currentUser: { id: string } | null = null;

vi.mock("@/repositories/profile", () => ({
  getClaimedChestNodeIds: (id: string) => getClaimedChestNodeIds(id),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: currentUser }),
}));

const { useOwnedEmotes, claimedChestsQueryKey } = await import("./use-owned-emotes");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const first = EMOTES[0];
const second = EMOTES[1];
if (!first || !second) throw new Error("the roster needs at least two emotes");
const firstNode = nodeForEmote(first);
if (!firstNode) throw new Error("the first emote needs a node");

beforeEach(() => {
  currentUser = { id: "user-1" };
  getClaimedChestNodeIds.mockResolvedValue([]);
});

describe("useOwnedEmotes", () => {
  it("never asks about a signed-out visitor", () => {
    currentUser = null;
    const { result } = renderHook(() => useOwnedEmotes(), { wrapper });
    expect(getClaimedChestNodeIds).not.toHaveBeenCalled();
    expect(result.current.owned).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("turns claimed chests into the emotes they hold", async () => {
    getClaimedChestNodeIds.mockResolvedValue([firstNode.id]);
    const { result } = renderHook(() => useOwnedEmotes(), { wrapper });
    await waitFor(() => expect(result.current.owned).toHaveLength(1));
    expect(result.current.owned[0]?.id).toBe(first.id);
  });

  it("always lists the whole roster, locked ones included", async () => {
    getClaimedChestNodeIds.mockResolvedValue([firstNode.id]);
    const { result } = renderHook(() => useOwnedEmotes(), { wrapper });
    await waitFor(() => expect(result.current.owned).toHaveLength(1));
    expect(result.current.roster).toHaveLength(EMOTES.length);
    expect(result.current.roster.filter((r) => r.owned)).toHaveLength(1);
  });

  it("reads a failed fetch as no emotes rather than throwing", async () => {
    // This runs inside a live battle. An error here must not take the screen
    // down over a cosmetic.
    getClaimedChestNodeIds.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useOwnedEmotes(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.owned).toEqual([]);
    expect(result.current.roster.every((r) => !r.owned)).toBe(true);
  });

  it("keys the cache per user, so one account cannot read another's", () => {
    expect(claimedChestsQueryKey("a")).not.toEqual(claimedChestsQueryKey("b"));
  });
});
