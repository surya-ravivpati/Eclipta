import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * The interesting cases are all about precedence, because there are two places
 * a language can be recorded and they can disagree. The profile is the one that
 * travels; the local copy is the one that survives a signed-out visit. Getting
 * the order wrong is silent - the user just sees the wrong language and has no
 * way to tell why.
 */

const getPreferredLanguage = vi.fn<(id: string) => Promise<string | null>>();
const setPreferredLanguage = vi.fn<(id: string, code: string) => Promise<void>>();
let currentUser: { id: string } | null = null;

vi.mock("@/repositories/profile", () => ({
  getPreferredLanguage: (id: string) => getPreferredLanguage(id),
  setPreferredLanguage: (id: string, code: string) => setPreferredLanguage(id, code),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: currentUser }),
}));

const { usePreferredLanguage } = await import("./use-preferred-language");

beforeEach(() => {
  currentUser = { id: "user-1" };
  getPreferredLanguage.mockResolvedValue(null);
  setPreferredLanguage.mockResolvedValue(undefined);
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("usePreferredLanguage", () => {
  it("asks for nothing when nobody is signed in", () => {
    currentUser = null;
    const { result } = renderHook(() => usePreferredLanguage());
    expect(result.current).toBeNull();
    expect(getPreferredLanguage).not.toHaveBeenCalled();
  });

  it("returns the saved language", async () => {
    getPreferredLanguage.mockResolvedValue("es");
    const { result } = renderHook(() => usePreferredLanguage());
    await waitFor(() => expect(result.current).toBe("es"));
    expect(setPreferredLanguage).not.toHaveBeenCalled();
  });

  it("ignores a saved language the app no longer ships", async () => {
    // A locale can be retired. Handing an unknown tag to the provider would
    // resolve to a message file that does not exist.
    getPreferredLanguage.mockResolvedValue("xx-YY");
    const { result } = renderHook(() => usePreferredLanguage());
    await waitFor(() => expect(getPreferredLanguage).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("sends up a choice made before signing in, so it reaches other devices", async () => {
    window.localStorage.setItem("eclipta:locale", "fr");
    const { result } = renderHook(() => usePreferredLanguage());
    await waitFor(() => expect(setPreferredLanguage).toHaveBeenCalledWith("user-1", "fr"));
    expect(result.current).toBe("fr");
  });

  it("records nothing when the local copy is only browser detection", async () => {
    // Nothing in localStorage means nobody ever chose. Writing the detected
    // language would turn a guess into a stated preference.
    const { result } = renderHook(() => usePreferredLanguage());
    await waitFor(() => expect(getPreferredLanguage).toHaveBeenCalled());
    expect(setPreferredLanguage).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("keeps quiet when the profile cannot be read", async () => {
    // The local copy already carries the page. An error here would be noise
    // about something the user did not ask for.
    getPreferredLanguage.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => usePreferredLanguage());
    await waitFor(() => expect(getPreferredLanguage).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("survives the write failing", async () => {
    window.localStorage.setItem("eclipta:locale", "fr");
    setPreferredLanguage.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => usePreferredLanguage());
    await waitFor(() => expect(result.current).toBe("fr"));
  });

  it("forgets the answer when the user signs out", async () => {
    getPreferredLanguage.mockResolvedValue("es");
    const { result, rerender } = renderHook(() => usePreferredLanguage());
    await waitFor(() => expect(result.current).toBe("es"));
    currentUser = null;
    rerender();
    expect(result.current).toBeNull();
  });
});
