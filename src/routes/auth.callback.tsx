import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * OAuth return landing.
 *
 * Google (and any future provider) redirects here after Supabase finishes the
 * exchange. With `detectSessionInUrl` + PKCE on the client, supabase-js swaps
 * the `?code=` for a session automatically on load; we just wait for that to
 * settle, then send the user into the app. If the provider handed back an
 * error (or nothing resolves), we surface it and route back to /login instead
 * of stranding the user on a blank page.
 *
 * The redirect target configured on the Supabase side must include this exact
 * path, e.g. https://your-app.vercel.app/auth/callback
 */
export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "Signing you in - Eclipta" }],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigate({ to: "/" });
    };

    // Surface an explicit provider error from the URL (query or hash).
    const params = new URLSearchParams(
      window.location.search || window.location.hash.replace(/^#/, ""),
    );
    const urlError = params.get("error_description") || params.get("error");
    if (urlError) {
      setError(urlError);
      return;
    }

    // If the session is already there (fast exchange), go straight in.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });

    // Otherwise wait for supabase-js to complete the code exchange.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    // Fallback: if nothing resolves in a few seconds, bail to login.
    const timeout = window.setTimeout(() => {
      if (!done) setError("Sign-in timed out. Please try again.");
    }, 8000);

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-sm">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-foreground">Couldn't sign you in</h1>
            <p className="mt-2 text-sm text-muted-foreground break-words">{error}</p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <div
              className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
              aria-hidden="true"
            />
            <p className="mt-4 text-sm text-muted-foreground">Signing you in...</p>
          </>
        )}
      </div>
    </div>
  );
}
