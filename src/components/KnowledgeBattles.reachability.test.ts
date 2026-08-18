import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A guard against a branch that cannot run.
 *
 * `complete_bot_battle_verified` shipped working, tested, and unreachable: the
 * branch calling it was gated on `sessionId`, a local hardcoded to `null` when
 * client-minted battle sessions were revoked. TypeScript narrowed it to `null`
 * and said nothing, the tests covered the repository function rather than the
 * call site, and the whole feature was dead on arrival for a day.
 *
 * Nothing in the normal gate catches that shape - a constant-false condition is
 * valid code. So it is caught here, by reading the file: any `const x = null`
 * later used as a condition in this component is the same mistake again.
 *
 * This is deliberately narrow. It is not a general dead-code checker; it pins
 * the one pattern that already cost a day, in the one file large enough to hide
 * it.
 */

const SOURCE = readFileSync(join(import.meta.dirname, "KnowledgeBattles.tsx"), "utf8");

describe("KnowledgeBattles has no branch gated on a constant", () => {
  it("declares no local that is initialised to null and never reassigned", () => {
    // `const x = null` is only ever a placeholder. Either the value arrives
    // from somewhere, or the code depending on it is dead.
    const declarations = [...SOURCE.matchAll(/^\s*const (\w+)\s*=\s*null;\s*$/gm)].map((m) => m[1]);

    expect(
      declarations,
      `these locals are pinned to null, so anything gated on them cannot run: ${declarations.join(", ")}`,
    ).toEqual([]);
  });

  it("still reaches the bot-rating path", () => {
    // The specific regression: the call exists and is not behind a dead guard.
    expect(SOURCE).toContain("completeBotBattleVerified(");
    expect(SOURCE).toMatch(/opponentTypeRef\.current === "bot"\)/);
  });
});
