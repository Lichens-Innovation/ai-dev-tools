import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "@repo/ui/toast";
import { SessionLogProvider } from "../utils/session-log-context";
import { ProjectProvider } from "../utils/project-context";
import { InstallProvider } from "../utils/install-context";
import { ChatProvider } from "../utils/chat-context";

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
      <InstallProvider>
        <SessionLogProvider>
          {/*
            Inside ProjectProvider, because a project switch ends the chat session — and above the
            Outlet, because TopNav (which renders the panel) is mounted per ROUTE. Holding the
            transcript in the panel would drop it on every navigation, along with the only handle
            on a run still streaming.
          */}
          <ChatProvider>
            <Outlet />
            <Toaster />
          </ChatProvider>
        </SessionLogProvider>
      </InstallProvider>
    </ProjectProvider>
  );
}
