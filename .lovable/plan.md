## 1. Fix PvP leaderboard wins/losses tracking

Root cause: `finishBattle` has no idempotency guard, so the same battle can be finalized twice (e.g. HP-zero local check fires, and the opponent's broadcast `battle_end` fires too). Each call invokes `updateRating`, double-incrementing W/L. Existing `player_ratings` data shows extreme imbalances (one user 0W/277L, another 242W/0L) consistent with this.

Fix: add a `battleFinishedRef` guard in `KnowledgeBattles.tsx` so `finishBattle` runs exactly once per battle; reset on new match.

## 2. User search

- New RPC `search_users(p_query text, p_limit int)` (security definer) returning `user_id, username, xp, equipped_ecliptar, avatar_url` for usernames matching `ILIKE p_query%` (case-insensitive, max 20).
- New `<UserSearchDialog />` component opened from a "Find Player" button on the Battles page hero. Debounced (250 ms) text input, clickable result rows with a "Challenge" button and a link to `/u/<username>`.

## 3. Direct challenges

Schema (migration):
- Table `pvp_challenges(id, challenger_id, challenged_id, challenger_archetype, status, created_at, expires_at, battle_id)` with RLS (only participants can view, only challenger can insert, only either side can update status).
- RPC `create_pvp_challenge(p_challenged_id uuid, p_archetype text)` → inserts row, also inserts a `notifications` row of type `challenge` linking back to `/battles?challenge=<id>`.
- RPC `respond_pvp_challenge(p_challenge_id uuid, p_accept bool, p_archetype text)` → if accept: creates a `pvp_battles` row, sets `status='accepted'` + `battle_id`; if reject: `status='rejected'`. Notifies challenger.
- Realtime: enable on `pvp_challenges` so both sides see status updates instantly.

UI:
- "Challenge to Battle" button on `/u/$username` (only when viewing another user, opens a small archetype picker that calls `create_pvp_challenge`, shows a toast).
- New `<ChallengeInbox />` panel on the Battles page above the leaderboard listing pending incoming challenges with Accept / Reject buttons. On accept, jumps straight into the live PvP flow using the returned `battle_id` (reuses existing `pvpChannelName = 'pvp-battle:<id>'` plumbing in `KnowledgeBattles`).
- Outgoing pending challenges shown as a small "Waiting for <user>…" pill that auto-dismisses on accept/reject.

Notifications: existing notification bell already renders new rows, so the `challenge` type will surface automatically with a friendly meta payload (`{ challenger_username, archetype }`).

## Files

- New migration: `pvp_challenges` table + `search_users` / `create_pvp_challenge` / `respond_pvp_challenge` RPCs + realtime + notification trigger.
- New: `src/components/battles/UserSearchDialog.tsx`, `src/components/battles/ChallengeInbox.tsx`.
- Edited: `src/components/KnowledgeBattles.tsx` (add idempotency guard, mount search button + inbox, wire accepted challenge → live battle), `src/routes/u.$username.tsx` (Challenge button).

## Out of scope

- Direct-challenge ELO weighting changes (uses existing `update_pvp_rating`).
- Friend lists / blocking.
- Tournament brackets.