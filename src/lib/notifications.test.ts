import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  NOTIFICATION_TYPES,
  dateBucket,
  notificationMeta,
  timeAgo,
} from "./notifications";

/**
 * This module exists because notification presentation used to live inline in
 * the page, so any type not handled there was silently dropped to a default.
 * The tests therefore care most about the fallback path: an unknown type has to
 * render as something a human can read, not vanish, because the type strings
 * come from the database and can outrun the client.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("the type table", () => {
  it("gives every type an icon, a category and a description", () => {
    for (const [type, meta] of Object.entries(NOTIFICATION_TYPES)) {
      expect(meta.icon, `${type} has no icon`).toBeTruthy();
      expect(CATEGORY_LABEL[meta.category], `${type} has an unknown category`).toBeTruthy();
      expect(meta.color.length).toBeGreaterThan(0);
      expect(typeof meta.describe).toBe("function");
    }
  });

  it("describes every type without throwing on empty metadata", () => {
    // Rows are written by several different producers; a missing field must
    // degrade to a readable sentence rather than crash the list.
    for (const [type, meta] of Object.entries(NOTIFICATION_TYPES)) {
      const text = meta.describe({});
      expect(text.length, `${type} produced an empty description`).toBeGreaterThan(0);
    }
  });

  it("names the actor when the metadata provides one", () => {
    const follow = NOTIFICATION_TYPES["follow"];
    expect(follow).toBeDefined();
    expect(follow?.describe({ username: "ada" })).toContain("ada");
  });

  it("falls back to a neutral actor when it does not", () => {
    const follow = NOTIFICATION_TYPES["follow"];
    expect(follow?.describe({})).toMatch(/someone/i);
  });

  it("has a label and an icon for every category", () => {
    for (const category of Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]) {
      expect(CATEGORY_LABEL[category].length).toBeGreaterThan(0);
      expect(CATEGORY_ICON[category]).toBeTruthy();
    }
  });
});

describe("notificationMeta", () => {
  it("returns the registered entry for a known type", () => {
    expect(notificationMeta("follow")).toBe(NOTIFICATION_TYPES["follow"]);
  });

  it("returns a usable fallback for a type the client has never heard of", () => {
    // The whole point of the module: a new server-side type must still render.
    const meta = notificationMeta("some_future_type_from_the_server");
    expect(meta).toBeTruthy();
    expect(meta.describe({}).length).toBeGreaterThan(0);
    expect(CATEGORY_LABEL[meta.category]).toBeTruthy();
  });
});

describe("dateBucket", () => {
  it("buckets today, yesterday and older separately", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    const iso = (d: string) => new Date(d).toISOString();
    expect(dateBucket(iso("2026-03-15T09:00:00Z"))).toBe("Today");
    expect(dateBucket(iso("2026-03-14T09:00:00Z"))).toBe("Yesterday");
    expect(dateBucket(iso("2026-03-01T09:00:00Z"))).toBe("Earlier");
  });
});

describe("timeAgo", () => {
  it("counts up through the units", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-15T12:00:00Z");
    vi.setSystemTime(now);
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    expect(timeAgo(ago(30_000))).toBe("just now");
    expect(timeAgo(ago(5 * 60_000))).toBe("5m");
    expect(timeAgo(ago(3 * 3_600_000))).toBe("3h");
    expect(timeAgo(ago(4 * 86_400_000))).toBe("4d");
  });

  it("falls back to a date once it is months old", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-15T12:00:00Z");
    vi.setSystemTime(now);
    const old = new Date(now.getTime() - 200 * 86_400_000).toISOString();
    const out = timeAgo(old);
    expect(out).not.toMatch(/^\d+[mhd]$/);
    expect(out.length).toBeGreaterThan(0);
  });
});
