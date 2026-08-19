import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserLink } from "./UserLink";

/**
 * The guard is the whole reason this is a component and not a `<Link>`. A
 * display name that is not a valid username has no profile page, and linking
 * to one produces a 404 dressed up as a link - which the three copies this
 * replaced all knew, and each checked slightly differently.
 */

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    className,
    children,
  }: {
    params: { username: string };
    className?: string;
    children: React.ReactNode;
  }) => (
    <a href={`/u/${params.username}`} className={className}>
      {children}
    </a>
  ),
}));

describe("UserLink", () => {
  it("links a valid username to its profile", () => {
    render(<UserLink name="learner_01" />);
    expect(screen.getByRole("link", { name: "learner_01" })).toHaveAttribute(
      "href",
      "/u/learner_01",
    );
  });

  it("renders a display name that is not a username as plain text", () => {
    render(<UserLink name="Ada Lovelace" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("does not link a name too short to be a username", () => {
    render(<UserLink name="ab" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the caller's classes in both shapes", () => {
    const { rerender } = render(<UserLink name="learner_01" className="btt-lb-row-name" />);
    expect(screen.getByRole("link")).toHaveClass("btt-lb-row-name");
    rerender(<UserLink name="Ada Lovelace" className="btt-lb-row-name" />);
    expect(screen.getByText("Ada Lovelace")).toHaveClass("btt-lb-row-name");
  });
});
