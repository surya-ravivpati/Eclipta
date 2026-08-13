import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/repositories/battles", () => ({
  getPlayerStanding: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

import { useAuth } from "@/hooks/use-auth";
import { getPlayerStanding } from "@/repositories/battles";
import { usePlayerRating } from "./use-player-rating";

function wrapper({ children }: { children: ReactNode }) {
  // A fresh, retry-free client per test so a deliberately-failing fetch in
  // one test can't leak a slow retry timer into the next.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockAuthedAs(userId: string) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: userId } as never,
    session: null,
    isAuthenticated: true,
    isLoading: false,
  });
}

describe("usePlayerRating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in a loading state before the first fetch resolves", () => {
    mockAuthedAs("u1");
    vi.mocked(getPlayerStanding).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePlayerRating(), { wrapper });

    expect(result.current.loading).toBe(true);
  });

  it("reports the default unranked state for a signed-out visitor, without querying the database", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
    });

    const { result } = renderHook(() => usePlayerRating(), { wrapper });

    expect(result.current).toMatchObject({
      rating: 1000,
      peakRating: 1000,
      ranked: false,
      loading: false,
    });
    expect(getPlayerStanding).not.toHaveBeenCalled();
  });

  it("reports the default unranked state for a player who has never battled", async () => {
    mockAuthedAs("u1");
    vi.mocked(getPlayerStanding).mockResolvedValue(null);

    const { result } = renderHook(() => usePlayerRating(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ rating: 1000, peakRating: 1000, ranked: false });
  });

  it("surfaces a real standing", async () => {
    mockAuthedAs("u1");
    vi.mocked(getPlayerStanding).mockResolvedValue({
      rating: 1240,
      peakRating: 1300,
      wins: 5,
      losses: 2,
      ranked: true,
    });

    const { result } = renderHook(() => usePlayerRating(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({
      rating: 1240,
      peakRating: 1300,
      wins: 5,
      losses: 2,
      ranked: true,
    });
  });

  it("stays ranked with zero games once a rating row exists", async () => {
    // Changed deliberately: `ranked` used to mean "has finished a match", which
    // hid every player who had entered the ladder but not yet completed one.
    // The server now answers it from the rating row itself.
    mockAuthedAs("u1");
    vi.mocked(getPlayerStanding).mockResolvedValue({
      rating: 1000,
      peakRating: 1000,
      wins: 0,
      losses: 0,
      ranked: true,
    });

    const { result } = renderHook(() => usePlayerRating(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ ranked: true, wins: 0, losses: 0 });
  });
});
