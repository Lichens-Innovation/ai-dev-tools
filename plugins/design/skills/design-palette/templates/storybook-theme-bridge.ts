// Lets the Claude Design palette card theme stories live.
// Import once from .storybook/preview.ts:  import './storybook-theme-bridge';
// Receives { type: 'palette:apply', css: string, mode: 'light' | 'dark' } and injects the CSS.
// Only a <style> element and color-scheme are touched; nothing received is executed.

const ALLOWED_ORIGINS: string[] = []; // e.g. ['https://claude.ai']; empty = accept any sender

type PaletteMessage = { type: "palette:apply"; css: string; mode?: "light" | "dark" };

const isPaletteMessage = (data: unknown): data is PaletteMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as PaletteMessage).type === "palette:apply" &&
  typeof (data as PaletteMessage).css === "string";

if (typeof window !== "undefined") {
  window.addEventListener("message", (event: MessageEvent) => {
    if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(event.origin)) return;
    if (!isPaletteMessage(event.data)) return;
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
