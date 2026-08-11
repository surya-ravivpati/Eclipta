import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarCropDialog } from "./AvatarCropDialog";

// jsdom has neither of these, and the dialog measures itself on mount. Nothing
// ever resizes here, so the stub simply never calls back.
class ResizeObserverStub implements ResizeObserver {
  observe(): void {
    // no layout in jsdom, so nothing to observe
  }
  unobserve(): void {
    // see observe()
  }
  disconnect(): void {
    // see observe()
  }
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  URL.createObjectURL = vi.fn(() => "blob:avatar-under-test");
  URL.revokeObjectURL = vi.fn();
});

const photo = () => new File(["binary"], "holiday.png", { type: "image/png" });

describe("AvatarCropDialog", () => {
  it("exposes zoom and both decisions as real, keyboard-reachable controls", () => {
    render(<AvatarCropDialog file={photo()} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("slider", { name: /zoom/i })).toHaveAttribute("type", "range");
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save photo/i })).toBeInTheDocument();
  });

  it("cancels on Escape, so the dialog is never a trap", async () => {
    const onCancel = vi.fn();
    render(<AvatarCropDialog file={photo()} onCancel={onCancel} onConfirm={vi.fn()} />);
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("revokes the object URL it created when it unmounts", () => {
    const { unmount } = render(
      <AvatarCropDialog file={photo()} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar-under-test");
  });
});
