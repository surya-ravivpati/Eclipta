import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Everything a user shares here is sent to a model, so this is a trust
 * boundary in both directions: the file arrives from the user's disk and its
 * output leaves the machine. The checks that matter are the ones that run
 * before anything is read - type and size - and the GIF exception, which is a
 * deliberate carve-out rather than an oversight: re-encoding an animation to
 * JPEG would silently flatten it to one frame.
 */

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (msg: string) => toastError(msg) } }));

const { processUserImage } = await import("./luna-image");

/** A File whose bytes never actually get read - FileReader is stubbed below. */
function fakeFile(type: string, size: number): File {
  const file = new File(["x"], "shared.png", { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/** Make FileReader resolve to `result`, or fail when it is null. */
function stubFileReader(result: string | null) {
  class StubReader {
    result: string | null = result;
    error: Error | null = result === null ? new Error("read failed") : null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
      queueMicrotask(() => (result === null ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal("FileReader", StubReader);
}

/** Make Image decode to the given intrinsic size, or fail. */
function stubImage(width: number | null, height = 0) {
  class StubImage {
    naturalWidth = width ?? 0;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => (width === null ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal("Image", StubImage);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubFileReader("data:image/png;base64,AAAA");
  stubImage(2000, 1000);
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() });
  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,BBBB");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("what it refuses", () => {
  it("rejects a type that is not an image we support", async () => {
    for (const type of ["application/pdf", "text/html", "image/svg+xml", ""]) {
      expect(await processUserImage(fakeFile(type, 1000)), type).toBeNull();
    }
    expect(toastError).toHaveBeenCalledTimes(4);
  });

  it("rejects an oversized file before reading a byte of it", async () => {
    const readSpy = vi.fn();
    vi.stubGlobal(
      "FileReader",
      class {
        readAsDataURL = readSpy;
      },
    );
    expect(await processUserImage(fakeFile("image/png", 9 * 1024 * 1024))).toBeNull();
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("accepts a file right on the size limit", async () => {
    expect(await processUserImage(fakeFile("image/png", 8 * 1024 * 1024))).not.toBeNull();
  });

  it("says something useful when the file cannot be read", async () => {
    stubFileReader(null);
    expect(await processUserImage(fakeFile("image/png", 1000))).toBeNull();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("Couldn't read"));
  });

  it("says something useful when the bytes are not a real image", async () => {
    stubImage(null);
    expect(await processUserImage(fakeFile("image/png", 2_000_000))).toBeNull();
  });
});

describe("what it does with an accepted image", () => {
  it("re-encodes a large image rather than sending it whole", async () => {
    const result = await processUserImage(fakeFile("image/png", 4_000_000));
    expect(result).toBe("data:image/jpeg;base64,BBBB");
  });

  it("scales the long edge down to the cap, keeping the aspect ratio", async () => {
    stubImage(2000, 1000);
    let canvas: HTMLCanvasElement | null = null;
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = createElement(tag);
      if (tag === "canvas") canvas = el as HTMLCanvasElement;
      return el;
    });

    await processUserImage(fakeFile("image/png", 4_000_000));

    expect(canvas!.width).toBe(1280);
    expect(canvas!.height).toBe(640);
  });

  it("leaves a small image alone instead of re-encoding it for nothing", async () => {
    stubImage(400, 300);
    const result = await processUserImage(fakeFile("image/png", 500_000));
    expect(result).toBe("data:image/png;base64,AAAA");
  });

  it("passes a GIF through so it keeps animating", async () => {
    // Re-encoding to JPEG would flatten it to a single frame without saying so.
    stubFileReader("data:image/gif;base64,GGGG");
    const result = await processUserImage(fakeFile("image/gif", 4_000_000));
    expect(result).toBe("data:image/gif;base64,GGGG");
  });

  it("falls back to the original when the image reports no dimensions", async () => {
    stubImage(0, 0);
    expect(await processUserImage(fakeFile("image/png", 2_000_000))).toBe(
      "data:image/png;base64,AAAA",
    );
  });

  it("falls back to the original when there is no drawing context", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
    expect(await processUserImage(fakeFile("image/png", 4_000_000))).toBe(
      "data:image/png;base64,AAAA",
    );
  });
});
