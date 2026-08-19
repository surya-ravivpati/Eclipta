import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * A leaderboard is a claim about people, so what is tested is that it does not
 * overstate one. A player who is rated but has never finished a match sits on
 * the starting rating and would otherwise appear to have earned it - the board
 * used to drop those rows entirely, which answered the honesty problem by
 * hiding the player from themselves.
 */

const rpc = vi.fn<(fn: string, args?: unknown) => Promise<{ data: unknown }>>();
const getUser = vi.fn(() => Promise.resolve({ data: { user: { id: "me" } } }));
const removeChannel = vi.fn<(channel: unknown) => void>();

/** A Realtime channel that records nothing and answers every chained call. */
interface FakeChannel {
  on: () => FakeChannel;
  subscribe: () => FakeChannel;
}

function channel(): FakeChannel {
  const c: FakeChannel = { on: () => c, subscribe: () => c };
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => getUser() },
    rpc: (fn: string, args?: unknown) => rpc(fn, args),
    channel: () => channel(),
    removeChannel: (c: unknown) => {
      removeChannel(c);
    },
  },
}));
vi.mock("@/components/common/UserLink", () => ({
  UserLink: ({ name, className }: { name: string; className?: string }) => (
    <span className={className}>{name}</span>
  ),
}));

const { LeaderboardCard } = await import("./LeaderboardCard");

const xpRow = (over: Record<string, unknown> = {}) => ({
  user_id: "u1",
  username: "learner_one",
  xp: 12_000,
  ...over,
});

const pvpRow = (over: Record<string, unknown> = {}) => ({
  user_id: "p1",
  username: "rival",
  rating: 1400,
  wins: 8,
  losses: 2,
  games: 10,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockImplementation((fn) =>
    Promise.resolve({ data: fn === "get_leaderboard" ? [xpRow()] : [pvpRow()] }),
  );
});

describe("LeaderboardCard", () => {
  it("asks for both ladders", async () => {
    render(<LeaderboardCard />);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc).toHaveBeenCalledWith("get_leaderboard", { p_limit: 10 });
    expect(rpc).toHaveBeenCalledWith("get_pvp_leaderboard", { p_limit: 10 });
  });

  it("opens on the rating ladder and can switch to XP", async () => {
    render(<LeaderboardCard />);
    expect(await screen.findByText("rival")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /XP/ }));
    expect(await screen.findByText("learner_one")).toBeInTheDocument();
  });

  it("marks a rated player who has not finished a match", async () => {
    // Their rating is the seed, not a result. Showing it unmarked would put an
    // unearned number next to a name.
    rpc.mockImplementation((fn) =>
      Promise.resolve({
        data: fn === "get_leaderboard" ? [] : [pvpRow({ games: 0, wins: 0, losses: 0 })],
      }),
    );
    render(<LeaderboardCard />);
    expect(await screen.findByText("rival")).toBeInTheDocument();
    expect(screen.getByText(/unrated|provisional|new/i)).toBeInTheDocument();
  });

  it("gives a nameless account something to be called", async () => {
    // A null username is a real state - onboarding can be incomplete - and an
    // empty row is worse than a derived handle.
    rpc.mockImplementation((fn) =>
      Promise.resolve({
        data: fn === "get_leaderboard" ? [xpRow({ username: null })] : [],
      }),
    );
    render(<LeaderboardCard />);
    await userEvent.click(await screen.findByRole("button", { name: /XP/ }));
    expect(await screen.findByText(/learner_u1/)).toBeInTheDocument();
  });

  it("survives a ladder coming back empty", async () => {
    rpc.mockResolvedValue({ data: [] });
    render(<LeaderboardCard />);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(screen.getByText("LEADERBOARD")).toBeInTheDocument();
  });

  it("lets go of its realtime channels when it unmounts", async () => {
    const { unmount } = render(<LeaderboardCard />);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    unmount();
    expect(removeChannel).toHaveBeenCalledTimes(2);
  });
});
