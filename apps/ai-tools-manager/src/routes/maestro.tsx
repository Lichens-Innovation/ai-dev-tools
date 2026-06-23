import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/agents-framework-kickstarter")({
  loader: () => {
    throw redirect({ to: "/workflows" });
  },
  component: () => null,
});
