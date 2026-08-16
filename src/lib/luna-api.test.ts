import { describe, it, expect } from "vitest";
import {
  LUNA_MAX_TURNS,
  LUNA_TAG_CONFIG,
  parseLunaActions,
  parseLunaTag,
  trimMessagesForApi,
} from "./luna-api";

/**
 * These three functions sit between the model's output and the user's screen,
 * which makes them a trust boundary: whatever the model emits, only things this
 * code recognises should become a link or a button. `parseLunaActions` already
 * knows that - it checks an allowlist of routes and requires https on external
 * resources - and neither guard was covered.
 *
 * The streaming call itself is not tested here; it is network I/O and belongs
 * in an integration test with a real transport.
 */

type Msg = Parameters<typeof trimMessagesForApi>[0][number];

const user = (content: string, imageDataUrl?: string): Msg => ({
  role: "user",
  content,
  ...(imageDataUrl ? { imageDataUrl } : {}),
});
const bot = (content: string): Msg => ({ role: "assistant", content });

describe("trimMessagesForApi", () => {
  it("leaves a short conversation alone", () => {
    const msgs = [user("hi"), bot("hello")];
    expect(trimMessagesForApi(msgs)).toHaveLength(2);
  });

  it("keeps the image on the most recent user turn only", () => {
    // The model needs to see the current screen, not every screen ever shared.
    const out = trimMessagesForApi([
      user("look at this", "data:image/png;base64,AAA"),
      bot("I see it"),
      user("and this", "data:image/png;base64,BBB"),
    ]);
    expect(out[0]).not.toHaveProperty("imageDataUrl");
    expect(out[2]).toHaveProperty("imageDataUrl");
  });

  it("gives a stripped image turn some text so it is not blank", () => {
    const out = trimMessagesForApi([
      user("", "data:image/png;base64,AAA"),
      user("newer", "data:image/png;base64,BBB"),
    ]);
    expect(out[0]?.content.length).toBeGreaterThan(0);
  });

  it("caps the history it sends", () => {
    const msgs = Array.from({ length: LUNA_MAX_TURNS + 10 }, (_, i) => user(`turn ${i}`));
    const out = trimMessagesForApi(msgs);
    expect(out.length).toBe(LUNA_MAX_TURNS + 1); // the summary, plus the window
  });

  it("summarises what it dropped rather than discarding it silently", () => {
    const msgs = Array.from({ length: LUNA_MAX_TURNS + 5 }, (_, i) => user(`topic ${i}`));
    const out = trimMessagesForApi(msgs);
    const summary = out[0];
    expect(summary?.role).toBe("assistant");
    expect(summary?.content).toMatch(/Earlier in this session/);
    expect(summary?.content).toMatch(/5 messages/);
  });

  it("keeps the newest turns, not the oldest", () => {
    const msgs = Array.from({ length: LUNA_MAX_TURNS + 3 }, (_, i) => user(`turn ${i}`));
    const out = trimMessagesForApi(msgs);
    expect(out[out.length - 1]?.content).toBe(`turn ${LUNA_MAX_TURNS + 2}`);
  });
});

describe("parseLunaTag", () => {
  it("pulls a leading tag off and returns the rest", () => {
    const { tag, text } = parseLunaTag("[HINT] Try factoring first.");
    expect(tag).toBe("hint");
    expect(text).toBe("Try factoring first.");
  });

  it("finds a tag the model drifted into the middle of a sentence", () => {
    const { tag, text } = parseLunaTag("Let me think... [EXPLAIN] here is why.");
    expect(tag).toBe("explain");
    expect(text).not.toContain("[EXPLAIN]");
  });

  it("tolerates whitespace and case inside the brackets", () => {
    expect(parseLunaTag("[ break ] take five").tag).toBe("break");
  });

  it("returns the content untouched when there is no tag", () => {
    const content = "Just a normal reply.";
    expect(parseLunaTag(content)).toEqual({ tag: null, text: content });
  });

  it("has display config for every tag it can return", () => {
    for (const t of ["hint", "nudge", "explain", "challenge", "break"] as const) {
      const cfg = LUNA_TAG_CONFIG[t];
      expect(cfg, `no config for ${t}`).toBeTruthy();
      expect(cfg.label.length).toBeGreaterThan(0);
    }
  });
});

describe("parseLunaActions", () => {
  it("extracts a quiz action and removes it from the visible text", () => {
    const { text, actions } = parseLunaActions('Sure! [[ACTION:quiz topic="limits" count="4"]]');
    expect(actions).toEqual([{ kind: "quiz", topic: "limits", count: 4 }]);
    expect(text).not.toContain("ACTION");
    expect(text).toContain("Sure!");
  });

  it("clamps a quiz count into a sane range", () => {
    expect(parseLunaActions('[[ACTION:quiz topic="x" count="99"]]').actions[0]).toMatchObject({
      count: 5,
    });
    expect(parseLunaActions('[[ACTION:quiz topic="x" count="0"]]').actions[0]).toMatchObject({
      count: 3,
    });
  });

  it("accepts an internal link only when it is on the allowlist", () => {
    const ok = parseLunaActions('[[ACTION:open href="/battles" label="Go"]]');
    expect(ok.actions).toHaveLength(1);
    // Anything else the model invents is dropped, not rendered as a link.
    const bad = parseLunaActions('[[ACTION:open href="/admin" label="Go"]]');
    expect(bad.actions).toHaveLength(0);
  });

  it("refuses an external resource that is not https", () => {
    // The model can emit any string here; only https ever becomes a link.
    expect(
      parseLunaActions('[[ACTION:resource title="T" url="http://x.com"]]').actions,
    ).toHaveLength(0);
    expect(
      parseLunaActions('[[ACTION:resource title="T" url="javascript:alert(1)"]]').actions,
    ).toHaveLength(0);
    expect(
      parseLunaActions('[[ACTION:resource title="T" url="https://x.com"]]').actions,
    ).toHaveLength(1);
  });

  it("drops an action missing its required fields", () => {
    expect(parseLunaActions("[[ACTION:quiz]]").actions).toHaveLength(0);
    expect(parseLunaActions('[[ACTION:open label="no href"]]').actions).toHaveLength(0);
  });

  it("ignores an action kind it does not know", () => {
    expect(parseLunaActions('[[ACTION:selfdestruct target="all"]]').actions).toHaveLength(0);
  });

  it("handles several actions in one reply", () => {
    const { actions } = parseLunaActions(
      'Try these. [[ACTION:quiz topic="a" count="2"]] [[ACTION:open href="/forum" label="Ask"]]',
    );
    expect(actions).toHaveLength(2);
  });

  it("returns the text unchanged when there are no actions", () => {
    expect(parseLunaActions("Plain reply.")).toEqual({ text: "Plain reply.", actions: [] });
  });

  it("collapses the blank lines an extracted action leaves behind", () => {
    const { text } = parseLunaActions('Before\n\n[[ACTION:quiz topic="a"]]\n\n\nAfter');
    expect(text).not.toMatch(/\n{3,}/);
  });
});
