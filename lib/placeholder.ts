// Generates a cute on-brand SVG sprite as a data URI. Used for the mock
// pipeline and seeded wild Anymons so something always renders.
const EMOJI: Record<string, string> = {
  book: "📚",
  waterbottle: "🍶",
  bottle: "🍶",
  umbrella: "☂️",
  lamp: "💡",
  mug: "☕",
  plant: "🪴",
  phone: "📱",
  shoe: "👟",
  mystery: "✨",
  creature: "✨",
};

export function placeholderSprite(object: string): string {
  const key = object?.toLowerCase().replace(/[^a-z]/g, "") || "mystery";
  const emoji = EMOJI[key] ?? "✨";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="70%" stop-color="#e9fff0"/>
      <stop offset="100%" stop-color="#d7f3ff"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <ellipse cx="256" cy="300" rx="150" ry="140" fill="#32CD32" opacity="0.9"/>
  <ellipse cx="256" cy="285" rx="120" ry="110" fill="#ffffff"/>
  <circle cx="214" cy="270" r="20" fill="#0b1f24"/>
  <circle cx="298" cy="270" r="20" fill="#0b1f24"/>
  <circle cx="220" cy="263" r="6" fill="#fff"/>
  <circle cx="304" cy="263" r="6" fill="#fff"/>
  <path d="M222 320 q34 30 68 0" stroke="#0b1f24" stroke-width="8" fill="none" stroke-linecap="round"/>
  <text x="256" y="150" font-size="96" text-anchor="middle">${emoji}</text>
  <text x="256" y="470" font-size="34" text-anchor="middle" fill="#00BFFF" font-family="monospace">${(object || "anymon").toLowerCase()}-mon</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// Public sample .glb models (Khronos glTF Sample Models) used by the mock
// pipeline and seeds so the 3D renderer always has something to show.
export const SAMPLE_GLBS = [
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb",
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BoomBox/glTF-Binary/BoomBox.glb",
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb",
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF-Binary/Lantern.glb",
];

export function sampleGlb(seed = 0): string {
  return SAMPLE_GLBS[Math.abs(seed) % SAMPLE_GLBS.length];
}
