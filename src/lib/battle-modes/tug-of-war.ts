/**
 * Tug-of-War: one shared bar instead of two health pools.
 *
 * There is deliberately no HP in this mode — the spec is explicit ("Single
 * progress bar... first to fill the bar wins"), and a bar bolted onto an
 * unchanged pair of health totals would just be Battle mode with a sidebar.
 * So every action is reinterpreted onto the ONE resource this mode has:
 *
 *   - Attack / Charge / Ultimate damage → pushes the bar toward the attacker.
 *     The push is the exact same number Battle mode would have subtracted
 *     from HP (already run through the defender's DEF and effects), so a
 *     hard-hitting archetype still hits hard and a well-armoured one is still
 *     hard to move. No new balance math.
 *   - A wrong answer pushes the bar toward the OPPONENT by the same
 *     miss-penalty roll Battle mode would have self-inflicted as damage —
 *     "every wrong answer hurts you" becomes "every wrong answer costs you
 *     ground" instead of costing you health that does not exist here.
 *   - Ultimate healing nudges the bar back toward center by the healed
 *     amount, since there is no HP pool for it to restore.
 *   - Defend (Heal) does not move the bar — there is nothing to heal — but
 *     still builds Focus, and a shield it grants reduces the next push
 *     AGAINST you by that amount, the same absorb-then-spend mechanic
 *     `absorbWithShield` already implements for HP.
 */

export const TUG_BAR_MAX = 120;

export interface TugState {
  /** -TUG_BAR_MAX (opponent's edge) .. +TUG_BAR_MAX (player's edge). Starts at 0. */
  position: number;
}

export function initialTugState(): TugState {
  return { position: 0 };
}

export type TugSide = "player" | "opponent";

/** Move the bar toward `side` by `amount` (always non-negative), clamped to the edges. */
export function pushTug(state: TugState, side: TugSide, amount: number): TugState {
  const signed = side === "player" ? amount : -amount;
  const next = state.position + signed;
  return { position: Math.max(-TUG_BAR_MAX, Math.min(TUG_BAR_MAX, next)) };
}

/** Bring the bar back toward center — an ultimate's heal output, reinterpreted. */
export function recoverTug(state: TugState, side: TugSide, amount: number): TugState {
  // Recovering means undoing ground already lost, not gaining new ground — a
  // heal cannot itself push you past center into the opponent's territory,
  // only relieve pressure back toward it.
  const towardCenter =
    side === "player" ? Math.max(0, -state.position) : Math.max(0, state.position);
  const applied = Math.min(amount, towardCenter);
  return pushTug(state, side, applied);
}

export function tugWinner(state: TugState): TugSide | null {
  if (state.position >= TUG_BAR_MAX) return "player";
  if (state.position <= -TUG_BAR_MAX) return "opponent";
  return null;
}

/** 0–100, from the player's perspective, for the bar's fill width. */
export function tugPercent(state: TugState): number {
  return Math.round(((state.position + TUG_BAR_MAX) / (2 * TUG_BAR_MAX)) * 100);
}
