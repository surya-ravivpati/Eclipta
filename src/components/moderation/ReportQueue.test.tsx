import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReportQueueItem } from "@/repositories/moderation";

/**
 * The order of operations is the whole point of this component, so that is
 * what is tested. A moderator who clicks "hide and close" is making one
 * decision, but it takes two writes: hide the content, then close the reports.
 * Doing them the other way round - or doing the second when the first failed -
 * empties the queue and leaves the content on screen, which is the worst
 * possible outcome because it also removes the record that would let anyone
 * notice.
 */

const calls: string[] = [];

type Resolve = (t: string, id: string | null, outcome: string) => Promise<number>;
type SetChat = (id: string, status: string, reason?: string) => Promise<boolean>;
type SetForum = (t: string, id: string, status: string, reason?: string) => Promise<{ ok: true }>;

const getReportQueue = vi.fn<() => Promise<ReportQueueItem[]>>();
const resolveReport = vi.fn<Resolve>(() => {
  calls.push("resolve");
  return Promise.resolve(3);
});
const setChatMessageStatus = vi.fn<SetChat>(() => {
  calls.push("hide-chat");
  return Promise.resolve(true);
});
const setModerationStatus = vi.fn<SetForum>(() => {
  calls.push("hide-forum");
  return Promise.resolve({ ok: true });
});
const toastError = vi.fn<(message: string) => void>();

vi.mock("@/repositories/moderation", () => ({
  getReportQueue: () => getReportQueue(),
  resolveReport: (...args: Parameters<Resolve>) => resolveReport(...args),
  setChatMessageStatus: (...args: Parameters<SetChat>) => setChatMessageStatus(...args),
}));
vi.mock("@/lib/moderation", () => ({
  setModerationStatus: (...args: Parameters<SetForum>) => setModerationStatus(...args),
}));
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: (m: string) => {
      toastError(m);
    },
  },
}));

const { ReportQueue } = await import("./ReportQueue");

function item(over: Partial<ReportQueueItem> = {}): ReportQueueItem {
  return {
    targetType: "chat_message",
    targetId: "msg-1",
    targetAuthor: "author-1",
    authorName: "quietstorm",
    reportCount: 3,
    firstReportedAt: new Date().toISOString(),
    lastReportedAt: new Date().toISOString(),
    categories: ["harassment"],
    notes: ["they keep doing it"],
    status: "pending",
    reporterConfirmed: 2,
    reporterResolved: 4,
    scannerDecision: "flag",
    scannerCategory: "harassment",
    scannerConfidence: 82,
    ...over,
  };
}

beforeEach(() => {
  calls.length = 0;
  getReportQueue.mockResolvedValue([item()]);
  resolveReport.mockClear();
  setChatMessageStatus.mockClear();
  setModerationStatus.mockClear();
  toastError.mockClear();
});

describe("ReportQueue", () => {
  it("shows one card per target, not one per report", async () => {
    render(<ReportQueue />);
    expect(await screen.findByText("3 REPORTS")).toBeInTheDocument();
    expect(screen.getByText("STUDY ROOM MESSAGE")).toBeInTheDocument();
    expect(screen.getByText("they keep doing it")).toBeInTheDocument();
  });

  it("says how often the reporter has been right, as context not a verdict", async () => {
    render(<ReportQueue />);
    expect(await screen.findByText(/reporter has been right/)).toHaveTextContent(
      "reporter has been right 2 of 4 times",
    );
  });

  it("says nothing about a reporter with no resolved history", async () => {
    getReportQueue.mockResolvedValue([item({ reporterConfirmed: 0, reporterResolved: 0 })]);
    render(<ReportQueue />);
    await screen.findByText("STUDY ROOM MESSAGE");
    expect(screen.queryByText(/reporter has been right/)).not.toBeInTheDocument();
  });

  it("hides the message before closing the reports on it", async () => {
    render(<ReportQueue />);
    await userEvent.click(await screen.findByRole("button", { name: "HIDE AND CLOSE" }));
    await waitFor(() => expect(resolveReport).toHaveBeenCalled());
    expect(calls).toEqual(["hide-chat", "resolve"]);
    expect(setChatMessageStatus).toHaveBeenCalledWith(
      "msg-1",
      "hidden",
      expect.stringContaining("Moderator"),
    );
  });

  it("routes forum content through the forum moderation path", async () => {
    getReportQueue.mockResolvedValue([item({ targetType: "thread", targetId: "t-1" })]);
    render(<ReportQueue />);
    await userEvent.click(await screen.findByRole("button", { name: "HIDE AND CLOSE" }));
    await waitFor(() => expect(resolveReport).toHaveBeenCalled());
    expect(calls).toEqual(["hide-forum", "resolve"]);
    expect(setChatMessageStatus).not.toHaveBeenCalled();
  });

  it("leaves the reports open when hiding the content failed", async () => {
    setChatMessageStatus.mockRejectedValueOnce(new Error("row is gone"));
    render(<ReportQueue />);
    await userEvent.click(await screen.findByRole("button", { name: "HIDE AND CLOSE" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("row is gone"));
    expect(resolveReport).not.toHaveBeenCalled();
  });

  it("clears a report without touching the content", async () => {
    render(<ReportQueue />);
    await userEvent.click(await screen.findByRole("button", { name: "NO VIOLATION" }));
    await waitFor(() => expect(resolveReport).toHaveBeenCalled());
    expect(calls).toEqual(["resolve"]);
    expect(resolveReport).toHaveBeenCalledWith("chat_message", "msg-1", "no_violation");
  });

  it("escalates without hiding, because handing over is not a verdict", async () => {
    render(<ReportQueue />);
    await userEvent.click(await screen.findByRole("button", { name: "ESCALATE" }));
    await waitFor(() => expect(resolveReport).toHaveBeenCalled());
    expect(calls).toEqual(["resolve"]);
    expect(resolveReport).toHaveBeenCalledWith("chat_message", "msg-1", "escalated");
  });

  it("marks content that has no row of its own, so nobody waits for a hide", async () => {
    getReportQueue.mockResolvedValue([item({ targetId: null })]);
    render(<ReportQueue />);
    expect(await screen.findByText("AI CONTENT")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "HIDE AND CLOSE" }));
    await waitFor(() => expect(resolveReport).toHaveBeenCalled());
    expect(calls).toEqual(["resolve"]);
  });

  it("offers no decision buttons on a report already resolved", async () => {
    getReportQueue.mockResolvedValue([item({ status: "action_taken" })]);
    render(<ReportQueue />);
    expect(await screen.findByText("ACTION TAKEN")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "HIDE AND CLOSE" })).not.toBeInTheDocument();
  });

  it("refetches when the filter changes", async () => {
    render(<ReportQueue />);
    await screen.findByText("STUDY ROOM MESSAGE");
    expect(getReportQueue).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "ESCALATED" }));
    await waitFor(() => expect(getReportQueue).toHaveBeenCalledTimes(2));
  });

  it("says so when the queue cannot be loaded, rather than looking empty", async () => {
    // An empty queue and an unreachable one look identical on screen, and only
    // one of them means there is nothing to do.
    getReportQueue.mockRejectedValue(new Error("not authorised"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ReportQueue />);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't load the report queue."));
  });
});
