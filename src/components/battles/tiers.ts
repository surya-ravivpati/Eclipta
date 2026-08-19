/**
 * Leaderboard name colours.
 *
 * Two ladders share this table: the XP board shows Expedition realms and the
 * rating board shows competitive leagues, and a player can appear on both under
 * different names. Keyed by display name rather than by id because that is what
 * each board has in hand at render time.
 */
export const tierColors: Record<string, string> = {
  // Expedition realms (XP leaderboard)
  Eclipse: "text-tier-god",
  Totality: "text-tier-unreal",
  Nightfall: "text-tier-champion",
  Umbra: "text-tier-platinum",
  Penumbra: "text-tier-diamond",
  Meridian: "text-tier-gold",
  Moonrise: "text-tier-silver",
  Dawn: "text-tier-bronze",
  // Competitive leagues (rating leaderboard)
  "God Tier": "text-tier-god",
  Unreal: "text-tier-unreal",
  Champion: "text-tier-champion",
  Platinum: "text-tier-platinum",
  Diamond: "text-tier-diamond",
  Gold: "text-tier-gold",
  Silver: "text-tier-silver",
  Bronze: "text-tier-bronze",
};
