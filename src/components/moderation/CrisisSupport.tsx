import { Heart, X } from "lucide-react";
import { SELF_HARM_RESOURCES } from "@/lib/moderation";

/**
 * Supportive crisis resources, surfaced to a user whose own message reads as
 * distress/self-harm. This is NOT a moderation consequence - the tone is warm
 * and it never blocks, accuses, or mentions any AI/persona. Their content is
 * unaffected; this just offers help.
 */
export function CrisisSupport({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="cs-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Support resources"
      onClick={onClose}
    >
      <div className="cs-card" onClick={(e) => e.stopPropagation()}>
        <button
          className="cs-close active:scale-[0.97] hover:opacity-90"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <div className="cs-head">
          <Heart size={18} className="cs-heart" /> You're not alone
        </div>
        <p className="cs-lead">
          It sounded like you might be going through something heavy. If you want to talk to someone
          right now, these people are there for you - any time, free and confidential.
        </p>
        <ul className="cs-list">
          {SELF_HARM_RESOURCES.map((r) => (
            <li key={r.label}>
              {r.href ? (
                <a
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cs-res active:scale-[0.97] hover:opacity-90"
                >
                  <b>{r.label}</b>
                  <span>{r.detail}</span>
                </a>
              ) : (
                <span className="cs-res">
                  <b>{r.label}</b>
                  <span>{r.detail}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <button className="cs-ok active:scale-[0.97] hover:opacity-90" onClick={onClose}>
          Thanks
        </button>
      </div>
    </div>
  );
}
