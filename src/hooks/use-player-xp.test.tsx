import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/repositories/profile", () => ({
  getUserXp: vi.fn(),
  getOwnedEcliptarSlugs: vi.fn(),
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
import { getOwnedEcliptarSlugs, getUserXp } from "@/repositories/profile";
import { usePlayerXp, useOwnedEcliptars } from "./use-player-xp";

function wrapper({ children }: { children: ReactNode }) {
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

function mockSignedOut() {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePlayerXp", () => {
  it("starts loading before the first fetch resolves", () => {
    mockAuthedAs("u1");
    vi.mocked(getUserXp).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePlayerXp(), { wrapper });

    expect(result.current.loading).toBe(true);
  });

  it("reports 0 XP for a signed-out visitor without querying the database", () => {
    mockSignedOut();

    const { result } = renderHook(() => usePlayerXp(), { wrapper });

    expect(result.current).toMatchObject({ xp: 0, loading: false });
    expect(getUserXp).not.toHaveBeenCalled();
  });

  it("surfaces the fetched XP total", async () => {
    mockAuthedAs("u1");
    vi.mocked(getUserXp).mockResolvedValue(720);

    const { result } = renderHook(() => usePlayerXp(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.xp).toBe(720);
  });
});

describe("useOwnedEcliptars", () => {
  it("reports an empty set for a signed-out visitor", () => {
    mockSignedOut();

    const { result } = renderHook(() => useOwnedEcliptars(), { wrapper });

    expect(result.current.slugs).toEqual(new Set());
    expect(result.current.loading).toBe(false);
    expect(getOwnedEcliptarSlugs).not.toHaveBeenCalled();
  });

  it("surfaces the fetched slugs as a Set", async () => {
    mockAuthedAs("u1");
    vi.mocked(getOwnedEcliptarSlugs).mockResolvedValue(["nitpick", "dingus"]);

    const { result } = renderHook(() => useOwnedEcliptars(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.slugs).toEqual(new Set(["nitpick", "dingus"]));
  });
});
