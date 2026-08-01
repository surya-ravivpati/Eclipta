import { useEffect, useRef } from "react";

/**
 * Escape-to-close and focus containment for overlays that are hand-rolled
 * rather than built on Radix `Dialog`.
 *
 * Radix gives all of this for free, so the right long-term fix for most of
 * these is to port them onto it. This hook exists because several overlays
 * (`Forum`'s composer, `StreakCelebration`, the lesson viewer) are custom
 * `fixed inset-0` layers that would otherwise trap a keyboard user on the page
 * behind them with no way out — a WCAG 2.2 SC 2.1.2 (No Keyboard Trap) failure.
 *
 * What it does, in the order the checkpoints matter:
 *   1. Escape closes.
 *   2. Focus moves into the overlay on open, so the next Tab lands inside it.
 *   3. Tab and Shift+Tab cycle within the overlay instead of escaping to the
 *      page behind.
 *   4. Focus returns to whatever opened the overlay on close, so the user
 *      resumes where they left off rather than at the top of the document.
 */
export function useModalA11y<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Prefer the first real control; fall back to the container itself so focus
    // is inside the overlay even when it holds nothing focusable yet.
    const first = focusable()[0];
    if (first) first.focus();
    else {
      node.setAttribute("tabindex", "-1");
      node.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) return;

      // Wrap at both ends so Tab never reaches the page behind the overlay.
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

/**
 * Props every modal container should spread, so the role and labelling are
 * declared once instead of being remembered at each call site.
 */
export function modalProps(labelledBy: string): {
  role: "dialog";
  "aria-modal": true;
  "aria-labelledby": string;
} {
  return { role: "dialog", "aria-modal": true, "aria-labelledby": labelledBy };
}
