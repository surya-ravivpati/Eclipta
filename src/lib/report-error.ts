/**
 * One place where a failure nobody awaited becomes visible.
 *
 * Most async work in the UI is started for its side effects and never awaited:
 * an effect loads a profile, a click fires off a save. Marking those with
 * `void` satisfies the linter, but on its own it throws the rejection away, so
 * a network blip shows up as a spinner that turns forever and an empty
 * console. The listeners installed here catch that case centrally, which is
 * what makes `void` at the call site an honest choice rather than a silencer.
 *
 * This only reports. It deliberately does not surface a toast: an unhandled
 * rejection is a programming error, and the code that owns the interaction is
 * better placed to tell the user something useful about it.
 */

/** Pull a readable message out of whatever was thrown. */
function describe(reason: unknown): string {
  if (reason instanceof Error) return reason.stack ?? `${reason.name}: ${reason.message}`;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    // A circular or otherwise unserialisable value still deserves a line.
    return Object.prototype.toString.call(reason);
  }
}

let installed = false;

/**
 * Installs the global listeners. Safe to call more than once, and a no-op
 * during server rendering, where there is no window to listen on.
 */
export function installGlobalErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", describe(event.reason));
  });

  // Errors thrown outside React's tree - inside a timer, a realtime callback,
  // an event listener - never reach an error boundary either.
  window.addEventListener("error", (event) => {
    console.error("Uncaught error:", describe(event.error ?? event.message));
  });
}
