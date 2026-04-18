import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/collection")({
  beforeLoad: () => {
    throw redirect({ to: "/profile" });
  },
});
