import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "@repo/ui/toast";
import { SessionLogProvider } from "../utils/session-log-context";
import { ProjectProvider } from "../utils/project-context";

// No `shellComponent` here, unlike the web app: TanStack Start rendered the whole <html>
// document server-side, so the root route owned <head>/<body>/<Scripts> and injected the theme
// script. In Electron the document is a static index.html — see ../../index.html, which carries
// the theme bootstrap and the renderer's CSP.
export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ProjectProvider>
      <SessionLogProvider>
        <Outlet />
        <Toaster />
      </SessionLogProvider>
    </ProjectProvider>
  );
}
