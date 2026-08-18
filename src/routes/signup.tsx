import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeRedirect } from "@/lib/safe-redirect";

/** See the note in login.tsx - the same destination survives either route. */
const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/signup")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign Up - Eclipta" },
      { name: "description", content: "Create your Eclipta account and start learning." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { redirect } = Route.useSearch();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <AuthForm mode="signup" redirectTo={safeRedirect(redirect)} />
    </div>
  );
}
