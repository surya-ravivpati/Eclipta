import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PasswordStrength } from "./PasswordStrength";
import { scorePassword } from "@/lib/password-strength";

describe("scorePassword", () => {
  it("scores an empty password as the weakest", () => {
    expect(scorePassword("")).toMatchObject({ score: 0, label: "Too weak" });
  });

  it("rewards length, mixed case, digits, and symbols", () => {
    expect(scorePassword("abcdefgh").score).toBe(1);
    expect(scorePassword("abcdefghijkl").score).toBe(2);
    expect(scorePassword("Abcdefghijkl").score).toBe(3);
    expect(scorePassword("Abcdefghijk1").score).toBe(4);
  });

  it("caps the score at 4 even when every rule is satisfied", () => {
    expect(scorePassword("Abcdefghijk1!").score).toBe(4);
  });
});

describe("PasswordStrength", () => {
  it("renders nothing until a password is typed", () => {
    const { container } = render(<PasswordStrength password="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the strength label for a weak password", () => {
    render(<PasswordStrength password="abc" />);
    expect(screen.getByText("Too weak")).toBeInTheDocument();
  });

  it("advises the user how to improve a password that is not yet strong", () => {
    render(<PasswordStrength password="abcdefgh" />);
    expect(screen.getByText(/Use 12\+ chars/)).toBeInTheDocument();
  });

  it("drops the advice once the password is strong enough", () => {
    render(<PasswordStrength password="Abcdefghijk1!" />);
    expect(screen.queryByText(/Use 12\+ chars/)).not.toBeInTheDocument();
  });
});
