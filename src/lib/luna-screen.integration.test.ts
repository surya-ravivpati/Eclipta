import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { captureScreenFrame } from "./luna-screen";

/**
 * Sharing a screen with a tutor is the most invasive thing this app asks for,
 * so the two properties worth pinning are about restraint rather than about
 * pixels.
 *
 * Declining has to be its own outcome. A refusal reported as a generic failure
 * would tell someone who deliberately said no that something went wrong, and
 * invite them to try again.
 *
 * And the stream has to be stopped on the way out. A capture that leaves it
 * open keeps the browser's "sharing your screen" indicator lit long after the
 * one frame was taken - which reads, correctly, as being watched.
 */

const stop = vi.fn();

/** A getDisplayMedia stand-in whose tracks record being stopped. */
function fakeStream() {
  const track = { stop };
  return { getVideoTracks: () => [track], getTracks: () => [track] };
}

function stubDisplayMedia(impl: () => Promise<unknown>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getDisplayMedia: vi.fn(impl) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  // jsdom has no media pipeline: play() is missing and canvas cannot rasterise.
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 2560,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 1440,
  });
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() });
  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,AAAA");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Run the capture, letting its settle delay elapse. */
async function capture() {
  const promise = captureScreenFrame();
  await vi.advanceTimersByTimeAsync(500);
  return promise;
}

describe("captureScreenFrame", () => {
  it("returns a frame and says so", async () => {
    stubDisplayMedia(() => Promise.resolve(fakeStream()));
    const result = await capture();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataUrl).toMatch(/^data:image\/jpeg/);
  });

  it("stops sharing the moment it has its frame", async () => {
    stubDisplayMedia(() => Promise.resolve(fakeStream()));
    await capture();
    expect(stop).toHaveBeenCalled();
  });

  it("scales a large screen down instead of sending it whole", async () => {
    // 2560 wide is halved to the 1280 cap; the payload travels to a model.
    // The canvas is never attached to the document, so it has to be caught as
    // it is created.
    stubDisplayMedia(() => Promise.resolve(fakeStream()));
    let canvas: HTMLCanvasElement | null = null;
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = createElement(tag);
      if (tag === "canvas") canvas = el as HTMLCanvasElement;
      return el;
    });

    await capture();

    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBe(1280);
    expect(canvas!.height).toBe(720);
  });

  it("treats a refusal as its own outcome, not a failure", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    stubDisplayMedia(() => Promise.reject(denied));

    const result = await capture();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("denied");
    // Nothing in the wording should suggest a fault to fix.
    expect(result.message).not.toMatch(/failed|error|wrong/i);
  });

  it("says so plainly when the browser cannot do it at all", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {} });
    const result = await capture();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("unsupported");
  });

  it("reports any other failure as retryable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubDisplayMedia(() => Promise.reject(new Error("hardware busy")));

    const result = await capture();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("failed");
    expect(result.message).toMatch(/try again/i);
  });

  it("fails cleanly when there is no drawing context", async () => {
    stubDisplayMedia(() => Promise.resolve(fakeStream()));
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);

    const result = await capture();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("failed");
  });
});
