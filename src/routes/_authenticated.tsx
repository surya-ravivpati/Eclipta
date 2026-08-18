import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    // Auth state lives in localStorage; on the server there's no session to
    // read so we'd incorrectly redirect to /login on every hard navigation.
    // Defer the check to the client.
    if (typeof window === "undefined") return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }

    // Skip the onboarding gate when already on the onboarding route
    if (location.pathname.startsWith("/onboarding")) return;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("onboarded_at")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!profile?.onboarded_at) {
      // Carry the destination through this gate too, or a first-time visitor
      // who clicked a specific page loses it to the onboarding hop.
      throw redirect({ to: "/onboarding", search: { redirect: location.href } });
    }
  },
  component: () => <Outlet />,
});
