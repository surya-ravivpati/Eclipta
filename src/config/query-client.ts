import { QueryClient } from "@tanstack/react-query";

/**
 * A factory, not a module-level singleton. TanStack Start can render on the
 * server, and a client created at module scope would be shared across every
 * request — one user's cached data leaking into another's response. Creating
 * it inside a component's `useState(createQueryClient)` scopes one instance
 * per render (per request on the server, per mount on the client).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Supabase Realtime subscriptions push their own invalidations where
        // they exist (see use-player-rating.tsx); a short staleTime just
        // stops an identical query from refetching on every remount in the
        // meantime.
        staleTime: 30_000,
        retry: 1,
      },
    },
  });
}
