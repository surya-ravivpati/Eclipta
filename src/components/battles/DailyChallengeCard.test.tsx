import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The claim button hands out XP, so the interesting cases are all the ones
 * where it must not: an incomplete challenge, one already claimed, a signed-out
 * visitor, and a server that refused. The check that actually protects the
 * economy is in Postgres - this is about not asking, and about not telling the
 * player they were paid when they were not.
 */

const rpc = vi.fn<(fn: string, args?: unknown) => Promise<{ data: unknown; error: unknown }>>();
const getUser = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const getProgress =
  vi.fn<(id: string, day: string) => Promise<{ wins: number; bonus_claimed: boolean } | null>>();
const awardXp = vi.fn<(event: string, fallback: number) => Promise<void>>(() => Promise.resolve());
const toastError = vi.fn();
const toastSuccess = vi.fn<(message: string, options?: unknown) => void>();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => getUser() },
    rpc: (fn: string, args?: unknown) => rpc(fn, args),
  },
}));
vi.mock("@/repositories/courses", () => ({
  getDailyChallengeProgress: (id: string, day: string) => getProgress(id, day),
}));
vi.mock("@/lib/xp-service", () => ({
  awardXp: (event: string, fallback: number) => awardXp(event, fallback),
}));
vi.mock("sonner", () => ({
  toast: {
    error: (m: string) => {
      toastError(m);
    },
    success: (m: string, o?: unknown) => {
      toastSuccess(m, o);
    },
  },
}));

const { DailyChallengeCard } = await import("./DailyChallengeCard");
const { getTodayChallenge } = await import("@/lib/daily-challenge");

const TARGET = getTodayChallenge().target;

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "me" } } });
  getProgress.mockResolvedValue({ wins: 0, bonus_claimed: false });
  rpc.mockResolvedValue({ data: true, error: null });
});

/** Wait for the initial progress fetch to settle. */
async function loaded() {
  await waitFor(() => expect(getProgress).toHaveBeenCalled());
}

describe("DailyChallengeCard", () => {
  it("asks about today, in UTC", async () => {
    render(<DailyChallengeCard />);
    await loaded();
    expect(getProgress).toHaveBeenCalledWith("me", new Date().toISOString().slice(0, 10));
  });

  it("does not ask about a signed-out visitor", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    render(<DailyChallengeCard />);
    await waitFor(() => expect(getUser).toHaveBeenCalled());
    expect(getProgress).not.toHaveBeenCalled();
  });

  it("offers no claim while the challenge is unfinished", async () => {
    getProgress.mockResolvedValue({ wins: Math.max(0, TARGET - 1), bonus_claimed: false });
    render(<DailyChallengeCard />);
    await loaded();
    expect(screen.queryByRole("button", { name: /CLAIM/ })).not.toBeInTheDocument();
  });

  it("offers the claim once the target is met", async () => {
    getProgress.mockResolvedValue({ wins: TARGET, bonus_claimed: false });
    render(<DailyChallengeCard />);
    expect(await screen.findByRole("button", { name: /CLAIM \+100 XP/ })).toBeEnabled();
  });

  it("claims through the server, then awards", async () => {
    getProgress.mockResolvedValue({ wins: TARGET, bonus_claimed: false });
    render(<DailyChallengeCard />);
    await userEvent.click(await screen.findByRole("button", { name: /CLAIM \+100 XP/ }));
    await waitFor(() => expect(awardXp).toHaveBeenCalledWith("daily_challenge", 100));
    expect(rpc).toHaveBeenCalledWith("claim_daily_challenge_bonus", { p_required_wins: TARGET });
  });

  it("awards nothing when the server refuses the claim", async () => {
    // The RPC is the authority: it checks the win count and the claimed flag in
    // one UPDATE so two clicks cannot both succeed.
    getProgress.mockResolvedValue({ wins: TARGET, bonus_claimed: false });
    rpc.mockResolvedValue({ data: false, error: null });
    render(<DailyChallengeCard />);
    await userEvent.click(await screen.findByRole("button", { name: /CLAIM \+100 XP/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(awardXp).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("shows an already-claimed day as done, with nothing left to press", async () => {
    getProgress.mockResolvedValue({ wins: TARGET, bonus_claimed: true });
    render(<DailyChallengeCard />);
    expect(await screen.findByText("CLAIMED")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CLAIM \+100 XP/ })).not.toBeInTheDocument();
  });

  it("counts down to the next UTC midnight", async () => {
    render(<DailyChallengeCard />);
    await loaded();
    expect(screen.getByText(/\d+h \d+m \d+s/)).toBeInTheDocument();
  });

  it("treats a missing progress row as no wins rather than as an error", async () => {
    getProgress.mockResolvedValue(null);
    render(<DailyChallengeCard />);
    await loaded();
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /CLAIM/ })).not.toBeInTheDocument();
  });
});
