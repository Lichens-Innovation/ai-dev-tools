// Lets the Claude Design palette card theme stories live.
// Import once from .storybook/preview.ts:  import './storybook-theme-bridge';
// Receives { type: 'palette:apply', css: string, mode: 'light' | 'dark' } and injects the CSS.
// Only a <style> element and color-scheme are touched; nothing received is executed.

// Senders accepted by published builds (e.g. Chromatic). Local development accepts any sender.
// Fill in from the origin the console reports the first time a card's message is ignored.
const ALLOWED_ORIGINS: string[] = [];

type PaletteMessage = { type: "palette:apply"; css: string; mode?: "light" | "dark" };

const isPaletteMessage = (data: unknown): data is PaletteMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as PaletteMessage).type === "palette:apply" &&
  typeof (data as PaletteMessage).css === "string";

const isLocalDev = () =>
  ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) ||
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

if (typeof window !== "undefined") {
  const acceptAny = isLocalDev();
  const warned = new Set<string>();
  window.addEventListener("message", (event: MessageEvent) => {
    if (!isPaletteMessage(event.data)) return;
    if (!acceptAny && !ALLOWED_ORIGINS.includes(event.origin)) {
      if (!warned.has(event.origin)) {
        warned.add(event.origin);
        console.warn(`storybook-theme-bridge: ignored palette from ${event.origin}; add it to ALLOWED_ORIGINS`);
      }
      return;
    }
    let style = document.getElementById("palette-live") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "palette-live";
      document.head.appendChild(style);
    }
    style.textContent = event.data.css;
    if (event.data.mode) document.documentElement.style.colorScheme = event.data.mode;
  });
}

export {};
