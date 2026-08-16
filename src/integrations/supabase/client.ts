import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";
import type { Database } from "./database";

function createSupabaseClient() {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      // Native OAuth (Google) redirects back with a ?code=; exchange it for a
      // session automatically using the PKCE flow.
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    _supabase ??= createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
