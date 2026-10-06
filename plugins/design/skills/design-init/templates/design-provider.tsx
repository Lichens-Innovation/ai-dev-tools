// Design provider for `/design sync`: wraps every synced card, proposal and screen mockup.
// Copy it into the package `/design sync` bundles, export it, and register it as the sync's provider.
// Adapt the imports to the project's React setup; nothing else needs to change.
//
// - light (default): renders exactly like Storybook. `/design sync` grades each card against its story.
// - dark: the same, with the dark scheme.
// - both: a light and a dark panel side by side, for proposals.
// In Claude Design the shared navbar (design-nav.js) loads here and its light/dark switch picks the mode.
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

type Mode = "light" | "dark";

const ColorScheme = ({ mode, children }: { mode: Mode; children: ReactNode }) => {
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = mode;
    html.style.colorScheme = mode;
  }, [mode]);
  return <>{children}</>;
};

const ModePanel = ({ mode, children }: { mode: Mode; children: ReactNode }) => (
  <div data-theme={mode} style={{ colorScheme: mode, background: "var(--bg)", color: "var(--text)", padding: 16 }}>
    {children}
  </div>
);

// Only in Claude Design, and only for synced cards, proposals and screen mockups: local renders (/design sync
// grading, design-loop screenshots), ?story= captures and the designs Claude Design builds stay as is.
const designNavRoot = () => {
  if (!location.hostname.endsWith(".claudeusercontent.com") || new URLSearchParams(location.search).has("story"))
    return null;
  const bundle = document.querySelector<HTMLScriptElement>('script[src*="_ds_bundle.js"]');
  if (!bundle) return null;
  const root = new URL("./", bundle.src);
  const path = decodeURIComponent(location.pathname).slice(decodeURIComponent(root.pathname).length);
  return /^(components|proposals|screens)\//.test(path) ? root : null;
};

// The navbar's light/dark switch, or null when the page has no navbar.
const useDesignNavMode = (): Mode | null => {
  const [mode, setMode] = useState<Mode | null>(() => (window as any).designNav?.mode ?? null);
  useEffect(() => {
    const root = designNavRoot();
    if (!root) return;
    const onMode = (e: Event) => setMode((e as CustomEvent<{ mode: Mode }>).detail.mode);
    window.addEventListener("design-nav:mode", onMode);
    if ((window as any).designNav) setMode((window as any).designNav.mode);
    else if (!document.querySelector("script[data-design-nav]")) {
      const script = document.createElement("script");
      script.src = new URL("design-nav.js", root).href;
      script.dataset.designNav = "";
      document.head.append(script);
    }
    return () => window.removeEventListener("design-nav:mode", onMode);
  }, []);
  return mode;
};

export const DesignProvider = ({ mode = "light", children }: { mode?: Mode | "both"; children: ReactNode }) => {
  const navMode = useDesignNavMode();
  return (
    <ColorScheme mode={navMode ?? (mode === "both" ? "light" : mode)}>
      {mode === "both" && !navMode ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          <ModePanel mode="light">{children}</ModePanel>
          <ModePanel mode="dark">{children}</ModePanel>
        </div>
      ) : (
        children
      )}
    </ColorScheme>
  );
};
