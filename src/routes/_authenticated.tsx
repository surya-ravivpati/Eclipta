import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getOnboardingStatus } from "@/repositories/profile";

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

    // A birth date is required to post, and accounts created before the age
    // gate existed do not have one - so "onboarded" is no longer enough.
    const status = await getOnboardingStatus(session.user.id);
    if (!status.onboarded || !status.hasBirthDate) {
      // Carry the destination through this gate too, or a first-time visitor
      // who clicked a specific page loses it to the onboarding hop.
      throw redirect({ to: "/onboarding", search: { redirect: location.href } });
    }
  },
  component: () => <Outlet />,
});
