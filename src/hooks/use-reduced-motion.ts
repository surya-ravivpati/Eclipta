import { useEffect, useState } from "react";
import { getMotionPreference } from "@/lib/a11y";

/**
 * Whether motion should be suppressed, combining the OS `prefers-reduced-motion`
 * with the in-app Reduce Motion preference.
 *
 * Framer's own `useReducedMotion` only reads the media query, so a user who set
 * Reduce Motion inside Eclipta while leaving their OS setting alone would still
 * get full animation from any JS-driven component. Prefer this hook over
 * Framer's anywhere the choice drives behaviour rather than styling - CSS is
 * already handled globally in styles.css.
 */
export function useAppReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    const evaluate = () => {
      const pref = getMotionPreference();
      // An explicit in-app choice overrides the OS in both directions: "full"
      // means the user wants animation even though the OS asks to reduce it.
      if (pref === "reduce") return setReduced(true);
      if (pref === "full") return setReduced(false);
      setReduced(media.matches);
    };

    evaluate();
    media.addEventListener("change", evaluate);
    // The preference is written to localStorage, which fires `storage` in other
    // tabs; a same-tab change re-renders through the settings component anyway.
    window.addEventListener("storage", evaluate);
    return () => {
      media.removeEventListener("change", evaluate);
      window.removeEventListener("storage", evaluate);
    };
  }, []);

  return reduced;
}
