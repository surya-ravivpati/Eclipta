import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
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
      throw redirect({ to: "/onboarding" });
    }
  },
  component: () => <Outlet />,
});
