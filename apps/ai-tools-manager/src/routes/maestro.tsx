import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/maestro")({
  loader: () => {
    throw redirect({ to: "/workflows" });
  },
  component: () => null,
});
