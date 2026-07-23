import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import "./BrandPresent.css";

/**
 * The logo easter egg.
 *
 * Click the top-left brand lockup five times quickly and a small present
 * pops — a note from the creator, teased at the bottom of the About page.
 *
 * `useLogoPresent()` hands back an `onLogoClick` to spread onto the logo link
 * plus the `present` element to render once. The click counter lives in a ref
 * so it survives the route change the first click triggers (the logo links
 * home), and because the Navbar is persistent the sequence keeps counting.
 */

const NEEDED = 5;
const WINDOW_MS = 1500;

export function useLogoPresent() {
  const clicks = useRef<number[]>([]);
  const [open, setOpen] = useState(false);

  const onLogoClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < WINDOW_MS), now];
    if (clicks.current.length >= NEEDED) {
      clicks.current = [];
      e.preventDefault(); // the winning click reveals the gift instead of navigating
      setOpen(true);
    }
  }, []);

  const present = <BrandPresent open={open} onClose={() => setOpen(false)} />;
  return { onLogoClick, present };
}

const CONFETTI_COLORS = [
  "#D4AF37", "#F6EFD9", "#3A4458",
  "oklch(0.60 0.17 255)", "oklch(0.70 0.14 245)", "#F4F1EA",
];

function BrandPresent({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // move focus into the dialog for keyboard + screen-reader users
    const id = window.setTimeout(() => closeRef.current?.focus(), 40);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(id);
    };
  }, [open, onClose]);

  // Confetti pieces — fixed set, generated once.
  const pieces = useMemo(
    () => Array.from({ length: 44 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2.6 + Math.random() * 1.8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 7,
      rot: Math.random() * 360,
      round: Math.random() > 0.7,
    })),
    [],
  );

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="bp-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bp-title"
        >
          <div className="bp-confetti" aria-hidden="true">
            {pieces.map((p) => (
              <span
                key={p.id}
                className="bp-confetti-piece"
                style={{
                  left: `${p.left}%`,
                  width: p.size,
                  height: p.size,
                  background: p.color,
                  borderRadius: p.round ? "50%" : "1px",
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                  ["--rot" as string]: `${p.rot}deg`,
                }}
              />
            ))}
          </div>

          <motion.div
            className="bp-card"
            initial={{ opacity: 0, y: 22, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button ref={closeRef} className="bp-close" onClick={onClose} aria-label="Close">
              <X className="w-4 h-4" />
            </button>

            <div className="bp-glove" aria-hidden="true">🥊</div>
            <p className="bp-eyebrow">A present, as promised</p>
            <h2 id="bp-title" className="bp-title">You clicked it. <em>Respect.</em></h2>

            <p className="bp-body">
              There's no catch. You clicked a logo five times because a stranger on the internet asked you
              to, and that exact kind of curiosity is the whole point of this thing.
            </p>
            <p className="bp-body">
              So go build something you don't fully understand yet, then stick around long enough to
              actually understand it. And if you box an AI with your webcam before I do, email me. I'll
              want to see it.
            </p>

            <div className="bp-signoff">
              <span className="bp-sign">Aarit</span>
              <a href="mailto:perswalaarit@gmail.com" className="bp-mail">perswalaarit@gmail.com</a>
            </div>

            <p className="bp-fine">(the real present was the bugs we fixed along the way)</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
