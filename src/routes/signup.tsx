import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth/AuthForm";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up — Eclipta" },
      { name: "description", content: "Create your Eclipta account and start learning." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <AuthForm mode="signup" />
    </div>
  );
}
