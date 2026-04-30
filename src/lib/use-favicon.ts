import { useEffect } from "react";

// Generate the AuraDocs favicon as an SVG data URL.
// When `pulsing` is true, brightness/hue intensifies slightly so users get
// passive feedback in the browser tab while Aura is synthesizing.
function buildFaviconSVG(pulsing: boolean): string {
  const violet = pulsing ? "#A78BFA" : "#8B5CF6";
  const cyan = pulsing ? "#22D3EE" : "#06B6D4";
  const glow = pulsing ? "1.0" : "0.0";
  const cursor = pulsing ? "#FFFFFF" : "#A5F3FC";

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${violet}"/>
      <stop offset="1" stop-color="${cyan}"/>
    </linearGradient>
    <radialGradient id="halo" cx="16" cy="16" r="14" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${cyan}" stop-opacity="${glow}"/>
      <stop offset="1" stop-color="${cyan}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="32" height="32" rx="6" fill="#0a0f1c"/>
  <circle cx="16" cy="16" r="14" fill="url(#halo)"/>
  <path d="M16 4 A12 12 0 1 1 6.5 23.5" stroke="url(#g)" stroke-width="3" stroke-linecap="round" fill="none"/>
  <rect x="14.5" y="10" width="3" height="12" rx="0.5" fill="${cursor}"/>
</svg>`.trim();

  return `data:image/svg+xml;base64,${typeof window !== "undefined" ? window.btoa(svg) : ""}`;
}

export function useFavicon(active: boolean) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      document.head.appendChild(link);
    }
    link.href = buildFaviconSVG(active);
  }, [active]);
}
