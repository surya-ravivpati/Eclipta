import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeRedirect } from "@/lib/safe-redirect";

/**
 * `?redirect=` is where the auth gate recorded the page the visitor wanted.
 * It is validated on the way in as well as on the way out, so a malformed one
 * is dropped here rather than carried around as a live value.
 */
const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign In - Eclipta" },
      { name: "description", content: "Sign in to your Eclipta account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <AuthForm mode="login" redirectTo={safeRedirect(redirect)} />
    </div>
  );
}
