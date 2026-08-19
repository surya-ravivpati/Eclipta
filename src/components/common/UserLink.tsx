import { Link } from "@tanstack/react-router";
import { isUsername } from "@/lib/username";
import { cn } from "@/lib/utils";

/**
 * A display name, linked to its profile when there is one to link to.
 *
 * Three copies of this existed - `AuthorLink` twice in the forum and `LbName`
 * on the leaderboard - and they had already drifted: the two forum ones
 * disagreed about text colour, and the leaderboard used a bare `<a>`, so
 * clicking a name there reloaded the whole application instead of routing.
 *
 * The guard is what makes it a component rather than a `<Link>`: a name that
 * is not a valid username has no profile page, and `/u/Some%20Display%20Name`
 * is a 404 dressed up as a link. Those render as plain text.
 */
export function UserLink({ name, className }: { name: string; className?: string }) {
  if (!isUsername(name)) {
    return <span className={cn("font-medium text-foreground", className)}>{name}</span>;
  }
  return (
    <Link
      to="/u/$username"
      params={{ username: name }}
      className={cn(
        "font-medium text-foreground hover:text-neon-purple transition-colors",
        className,
      )}
    >
      {name}
    </Link>
  );
}
