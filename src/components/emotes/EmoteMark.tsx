import { MotionConfig, motion } from "framer-motion";
import type { EmoteId } from "@/config/emotes";
import { useAppReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * The drawn marks themselves.
 *
 * SVG and Framer Motion rather than image files: eight small vector marks cost
 * a few kilobytes of the bundle they already load, scale to any size without a
 * second asset, and take their colour from the surface they land on - which is
 * what lets one emote read correctly on both the gold "you" side and the
 * silver "opponent" side of a battle.
 *
 * Every animation is short and finishes. An emote that loops forever is a
 * distraction sitting on top of a timed question, and the arena already
 * decided that expression must not interrupt play.
 */

function Frame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title}
      className="w-full h-full"
    >
      {children}
    </svg>
  );
}

const MARKS: Record<EmoteId, (title: string) => React.ReactElement> = {
  spark: (title) => (
    <Frame title={title}>
      <motion.path
        d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 1, 0.85], scale: [0.4, 1.15, 1] }}
        transition={{ duration: 0.5, times: [0, 0.6, 1] }}
        style={{ transformOrigin: "12px 12px" }}
      />
    </Frame>
  ),

  nod: (title) => (
    <Frame title={title}>
      <motion.g
        initial={{ y: -3 }}
        animate={{ y: [-3, 3, 0] }}
        transition={{ duration: 0.55, times: [0, 0.55, 1] }}
      >
        <path d="M5 9l7 6 7-6" />
        <path d="M5 4l7 6 7-6" opacity={0.35} />
      </motion.g>
    </Frame>
  ),

  applause: (title) => (
    <Frame title={title}>
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d={`M${6 + i * 3} ${19 - i * 2}c1.5-${3 + i} 4.5-${3 + i} 6 0`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: [0, 1, 0], y: [4, -4, -8] }}
          transition={{ duration: 0.8, delay: i * 0.12 }}
        />
      ))}
    </Frame>
  ),

  focus: (title) => (
    <Frame title={title}>
      <motion.circle
        cx={12}
        cy={12}
        r={6}
        initial={{ scale: 1.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{ transformOrigin: "12px 12px" }}
      />
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.2 }}
      >
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx={12} cy={12} r={1.4} fill="currentColor" stroke="none" />
      </motion.g>
    </Frame>
  ),

  ascend: (title) => (
    <Frame title={title}>
      <motion.g
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: [6, -3, -5], opacity: [0, 1, 0] }}
        transition={{ duration: 0.9, times: [0, 0.5, 1] }}
      >
        <path d="M12 20V7" />
        <path d="M6 12l6-6 6 6" />
      </motion.g>
      <path d="M5 21h14" opacity={0.4} />
    </Frame>
  ),

  crown: (title) => (
    <Frame title={title}>
      <motion.path
        d="M4 17l-1-9 5 4 4-7 4 7 5-4-1 9z"
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 14 }}
      />
      <path d="M4 20h16" />
      {/* The shine sweeps once, after the crown lands. */}
      <motion.path
        d="M3 11l18-6"
        strokeWidth={2.4}
        opacity={0.5}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.6, 0] }}
        transition={{ delay: 0.35, duration: 0.5 }}
      />
    </Frame>
  ),

  eclipse: (title) => (
    <Frame title={title}>
      <motion.circle
        cx={12}
        cy={12}
        r={7}
        initial={{ opacity: 0.5 }}
        animate={{ opacity: [0.5, 1, 0.8] }}
        transition={{ duration: 0.9 }}
      />
      {/* The occluding disc slides across and stops centred. */}
      <motion.circle
        cx={12}
        cy={12}
        r={7}
        fill="currentColor"
        stroke="none"
        initial={{ x: -11, opacity: 0.9 }}
        animate={{ x: -1.5 }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
      />
      <motion.g
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 0.7, scale: 1 }}
        transition={{ delay: 0.7, duration: 0.4 }}
        style={{ transformOrigin: "12px 12px" }}
      >
        <path d="M12 1v2M12 21v2M1 12h2M21 12h2" />
      </motion.g>
    </Frame>
  ),

  supernova: (title) => (
    <Frame title={title}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
        <motion.path
          key={deg}
          d="M12 8V2"
          style={{ transformOrigin: "12px 12px", rotate: `${deg}deg` }}
          initial={{ scaleY: 0.2, opacity: 0 }}
          animate={{ scaleY: [0.2, 1, 0.75], opacity: [0, 1, 0.5] }}
          transition={{ duration: 0.7, delay: i * 0.02 }}
        />
      ))}
      <motion.circle
        cx={12}
        cy={12}
        r={3}
        fill="currentColor"
        stroke="none"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.35, 1] }}
        transition={{ duration: 0.5 }}
        style={{ transformOrigin: "12px 12px" }}
      />
    </Frame>
  ),
};

/**
 * Draw one emote. Unknown ids render nothing rather than a placeholder - the
 * only way to reach one is a message from another client, and a stranger does
 * not get to put a "?" box on your screen.
 */
/**
 * Looked up through a Map rather than by indexing the object.
 *
 * `MARKS["toString"]` on a plain object returns `Object.prototype.toString` -
 * truthy, callable, and it rendered "[object Undefined]" on screen before a
 * test caught it. The id arrives from another player's browser, so "not in the
 * roster" has to mean nothing at all, not "whatever the prototype has".
 */
const MARK_BY_ID = new Map(Object.entries(MARKS));

export function EmoteMark({ id, label }: { id: string; label: string }) {
  // Framer's `reducedMotion="always"` jumps every animation to its end state,
  // which is exactly right here: the mark still arrives, it just does not move
  // on the way in. `useAppReducedMotion` is used rather than Framer's own hook
  // because it also honours the in-app Reduce Motion setting.
  const reduced = useAppReducedMotion();
  const draw = MARK_BY_ID.get(id);
  if (!draw) return null;
  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <span className="inline-block w-full h-full">{draw(label)}</span>
    </MotionConfig>
  );
}
