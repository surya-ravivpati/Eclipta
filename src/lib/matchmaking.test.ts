import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ArchetypeId } from "@/components/battles/types";

/**
 * One rule governs this module and it is stated at the top of the file: a bot
 * is never preferred over a real player. That is a priority, not a
 * calculation, so the way to test it is to make a live match available and
 * check a bot never comes back - and to make one arrive late and check the
 * search waited for it.
 *
 * The second thing worth pinning is that a bot match is indistinguishable from
 * a live one in everything the UI reads. Only `type` differs, because rating
 * weight and W/L accounting still depend on it.
 */

const getUser = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const enqueuePvpRpc = vi.fn<(a: ArchetypeId) => Promise<void>>();
const leavePvpQueue = vi.fn<(id: string) => Promise<void>>();
const findPvpMatchRpc = vi.fn<(a: ArchetypeId, r: number) => Promise<Record<string, unknown>>>();
const findActivePvpBattleForUser = vi.fn<(id: string) => Promise<Record<string, unknown> | null>>();
const getPlayerRating = vi.fn<(id: string) => Promise<{ rating: number } | null>>();
const getUsername = vi.fn<(id: string) => Promise<string | null>>();
const pickBotOpponent = vi.fn<(r: number) => { username: string; rating: number }>();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: () => getUser() } },
}));
vi.mock("@/repositories/battles", () => ({
  enqueuePvpRpc,
  leavePvpQueue,
  findPvpMatchRpc,
  findActivePvpBattleForUser,
  getPlayerRating,
}));
vi.mock("@/repositories/profile", () => ({ getUsername }));
vi.mock("./bots/roster", () => ({ pickBotOpponent }));

const { findMatch, joinQueue, leaveQueue } = await import("./matchmaking");

const ME = "user-me";
const OPP = "user-opponent";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ME } } });
  enqueuePvpRpc.mockResolvedValue(undefined);
  leavePvpQueue.mockResolvedValue(undefined);
  findPvpMatchRpc.mockResolvedValue({ matched: false });
  findActivePvpBattleForUser.mockResolvedValue(null);
  getPlayerRating.mockResolvedValue({ rating: 1100 });
  getUsername.mockResolvedValue("Rival");
  pickBotOpponent.mockReturnValue({ username: "QuietMoth", rating: 1020 });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Run findMatch to completion, driving the polling loop's timers. */
async function runMatch(opts?: Parameters<typeof findMatch>[4]) {
  vi.useFakeTimers();
  const statuses: { msg: string; tier: string }[] = [];
  const promise = findMatch("tank", 1000, "me", (msg, tier) => statuses.push({ msg, tier }), opts);
  // The queue window is 8s, polled every 800ms; overshoot it comfortably.
  await vi.advanceTimersByTimeAsync(12_000);
  return { result: await promise, statuses };
}

describe("queue management", () => {
  it("enqueues through the RPC, never writing rating or name from the client", async () => {
    await joinQueue("healer", 9999, "spoofed");
    expect(enqueuePvpRpc).toHaveBeenCalledWith("healer");
    expect(enqueuePvpRpc).toHaveBeenCalledOnce();
  });

  it("does nothing for a signed-out user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await joinQueue("tank", 1000, null);
    await leaveQueue();
    expect(enqueuePvpRpc).not.toHaveBeenCalled();
    expect(leavePvpQueue).not.toHaveBeenCalled();
  });

  it("leaves the queue under the caller's own id", async () => {
    await leaveQueue();
    expect(leavePvpQueue).toHaveBeenCalledWith(ME);
  });
});

describe("findMatch: live is always preferred", () => {
  it("returns the live match when this client is the one that matched", async () => {
    findPvpMatchRpc.mockResolvedValue({
      matched: true,
      opponent_user_id: OPP,
      opponent_username: "Rival",
      opponent_archetype: "speedster",
      opponent_rating: 1180,
      battle_id: "battle-1",
    });

    const { result } = await runMatch();

    expect(result.type).toBe("live");
    expect(result).toMatchObject({
      opponentName: "Rival",
      opponentUserId: OPP,
      opponentArchetype: "speedster",
      opponentRating: 1180,
      pvpBattleId: "battle-1",
      pvpChannelName: "pvp-battle:battle-1",
      iAmChallenger: true,
    });
    expect(pickBotOpponent).not.toHaveBeenCalled();
  });

  it("finds a battle someone else opened against us", async () => {
    // The matching RPC only hands the battle id to the challenger, so the
    // other side has to notice by looking for its own active battle.
    findActivePvpBattleForUser.mockResolvedValue({
      id: "battle-2",
      challenger_id: OPP,
      opponent_id: ME,
      challenger_archetype: "god",
      opponent_archetype: "tank",
    });

    const { result } = await runMatch();

    expect(result.type).toBe("live");
    expect(result).toMatchObject({
      opponentUserId: OPP,
      opponentArchetype: "god",
      iAmChallenger: false,
      pvpBattleId: "battle-2",
    });
  });

  it("waits out the queue rather than taking a bot early", async () => {
    // No match on the first poll, one on a later poll. The bot tier must not
    // win just because it was available sooner.
    findPvpMatchRpc
      .mockResolvedValueOnce({ matched: false })
      .mockResolvedValueOnce({ matched: false })
      .mockResolvedValue({
        matched: true,
        opponent_user_id: OPP,
        opponent_username: "Latecomer",
        opponent_archetype: "tank",
        opponent_rating: 1000,
        battle_id: "battle-3",
      });

    const { result } = await runMatch();

    expect(result.type).toBe("live");
    expect(result.opponentName).toBe("Latecomer");
    expect(pickBotOpponent).not.toHaveBeenCalled();
  });

  it("names an opponent with no username from their id", async () => {
    findPvpMatchRpc.mockResolvedValue({
      matched: true,
      opponent_user_id: "abcdef123456",
      opponent_username: null,
      opponent_archetype: "tank",
      opponent_rating: null,
      battle_id: "b",
    });

    const { result } = await runMatch();

    expect(result.opponentName).toBe("Player_abcdef");
    expect(result.opponentRating).toBe(1000);
  });
});

describe("findMatch: falling back to a bot", () => {
  it("takes a bot only after the queue window closes", async () => {
    const { result } = await runMatch();

    expect(result.type).toBe("bot");
    expect(result.opponentName).toBe("QuietMoth");
    expect(leavePvpQueue).toHaveBeenCalledWith(ME);
  });

  it("says the same thing a live match would", async () => {
    // The bot/human distinction is disclosed in the explainer, not stamped on
    // the match. Anything the player reads has to look identical.
    const live = await (async () => {
      findPvpMatchRpc.mockResolvedValue({
        matched: true,
        opponent_user_id: OPP,
        opponent_username: "Rival",
        opponent_archetype: "tank",
        opponent_rating: 1020,
        battle_id: "b",
      });
      return runMatch();
    })();
    findPvpMatchRpc.mockResolvedValue({ matched: false });
    const bot = await runMatch();

    const shape = (s: string) => s.replace(/- .*/, "- <name>");
    expect(shape(bot.statuses.at(-1)!.msg)).toBe(shape(live.statuses.at(-1)!.msg));
    // Only the machine-readable field differs, because rating weight and the
    // win/loss record still depend on knowing.
    expect(bot.result.type).toBe("bot");
    expect(live.result.type).toBe("live");
  });

  it("skips the live queue entirely for a mode that cannot support it", async () => {
    const { result } = await runMatch({ allowLive: false });

    expect(result.type).toBe("bot");
    expect(enqueuePvpRpc).not.toHaveBeenCalled();
    expect(findPvpMatchRpc).not.toHaveBeenCalled();
  });

  it("goes straight to a bot for a signed-out player", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const { result } = await runMatch();

    expect(result.type).toBe("bot");
    expect(enqueuePvpRpc).not.toHaveBeenCalled();
  });

  it("leaves the archetype for the caller to roll", async () => {
    const { result } = await runMatch();
    expect(result.opponentArchetype).toBeNull();
  });
});
