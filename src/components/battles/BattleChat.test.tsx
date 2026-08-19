import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { BattleChat } from "./BattleChat";
import { EMOTES } from "@/config/emotes";

/**
 * Expression in a battle has two constraints that are not about features: it
 * must be impossible to compose an insult, and it must be impossible to turn
 * into a stream. Both are properties of this component, so both are tested -
 * a preset list satisfies the first, and one shared cooldown the second.
 */

const send = vi.fn(() => Promise.resolve("ok"));
const roster = vi.fn(() => EMOTES.map((emote) => ({ emote, owned: true, from: null })));

vi.mock("@/hooks/use-owned-emotes", () => ({
  useOwnedEmotes: () => ({ owned: [], roster: roster(), loading: false }),
}));

function channelRef() {
  return { current: { send } as unknown as RealtimeChannel };
}

const base = {
  opponentType: "live" as const,
  playerName: "learner",
  phase: "select" as const,
  incomingItems: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  roster.mockReturnValue(EMOTES.map((emote) => ({ emote, owned: true, from: null })));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BattleChat", () => {
  it("stays out of the way outside an active turn", () => {
    // Nothing to say between matches, and a panel on the result screen would
    // be one more thing on top of the numbers.
    const { container } = render(
      <BattleChat {...base} phase="result" pvpChannelRef={channelRef()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a fixed list, so no insult can be composed", async () => {
    render(<BattleChat {...base} pvpChannelRef={channelRef()} />);
    await userEvent.click(screen.getByRole("button", { name: "Quick chat" }));
    expect(screen.getByRole("button", { name: "GG" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("broadcasts a phrase to the opponent", async () => {
    render(<BattleChat {...base} pvpChannelRef={channelRef()} />);
    await userEvent.click(screen.getByRole("button", { name: "Quick chat" }));
    await userEvent.click(screen.getByRole("button", { name: "GG" }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "chat",
        payload: expect.objectContaining({ text: "GG", emote_id: null }),
      }),
    );
  });

  it("broadcasts an emote as an id, never as rendered content", async () => {
    const first = EMOTES[0];
    expect(first).toBeDefined();
    if (!first) return;
    render(<BattleChat {...base} pvpChannelRef={channelRef()} />);
    await userEvent.click(screen.getByRole("button", { name: "Quick chat" }));
    await userEvent.click(screen.getByRole("button", { name: new RegExp(first.name) }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ emote_id: first.id }),
      }),
    );
  });

  it("shares one cooldown between phrases and emotes", async () => {
    // Two budgets would let a player alternate and double the rate.
    const user = userEvent.setup();
    render(<BattleChat {...base} pvpChannelRef={channelRef()} />);
    await user.click(screen.getByRole("button", { name: "Quick chat" }));
    await user.click(screen.getByRole("button", { name: "GG" }));
    expect(send).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Nice!" }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("says nothing over the wire in a bot match", async () => {
    render(<BattleChat {...base} opponentType="bot" pvpChannelRef={channelRef()} />);
    await userEvent.click(screen.getByRole("button", { name: "Quick chat" }));
    await userEvent.click(screen.getByRole("button", { name: "GG" }));
    expect(send).not.toHaveBeenCalled();
    // Two "GG" now: the button that was pressed, and the bubble it produced.
    expect(screen.getAllByText("GG")).toHaveLength(2);
  });

  it("shows an opponent's message, and stops when muted", async () => {
    const incoming = [
      { id: 1, text: "Well played", fromPlayer: false, senderName: "rival", ts: Date.now() },
    ];
    render(<BattleChat {...base} incomingItems={incoming} pvpChannelRef={channelRef()} />);
    expect(screen.getByText("Well played")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mute opponent" }));
    // The bubble animates out, so it is gone shortly rather than instantly.
    await waitForElementToBeRemoved(() => screen.queryByText("Well played"));
  });

  it("locks an emote the player has not earned, and names the chest", async () => {
    const first = EMOTES[0];
    expect(first).toBeDefined();
    if (!first) return;
    roster.mockReturnValue(
      EMOTES.map((emote) => ({ emote, owned: false, from: { label: "Dawn Vault" } as never })),
    );
    render(<BattleChat {...base} pvpChannelRef={channelRef()} />);
    await userEvent.click(screen.getByRole("button", { name: "Quick chat" }));
    const button = screen.getByRole("button", { name: new RegExp(`${first.name}, locked`) });
    expect(button).toBeDisabled();
    expect(button.getAttribute("aria-label")).toContain("Dawn Vault");
  });

  it("lets a bubble expire rather than stacking the whole match on screen", () => {
    vi.useFakeTimers();
    const stale = [
      { id: 1, text: "Good luck", fromPlayer: false, senderName: "rival", ts: Date.now() - 9_000 },
    ];
    render(<BattleChat {...base} incomingItems={stale} pvpChannelRef={channelRef()} />);
    act(() => undefined);
    expect(screen.queryByText("Good luck")).not.toBeInTheDocument();
  });
});
