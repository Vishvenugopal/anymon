// "Who's that Anymon?" placeholder: a solid black blob silhouette with a big
// white question mark, used while the real sprite is being generated (and as the
// "unknown / being generated" visual). Returned as an SVG data URI so every
// existing usage (deck, incubating, seeds) keeps working unchanged.
// NOTE: this is intentionally NOT a raster image — meshy.isRasterImage() rejects
// it so the pipeline never feeds a silhouette to a 3D provider.
export function placeholderSprite(_object?: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ffffff"/>
  <g fill="#0a1418">
    <!-- chunky creature silhouette: round body, two ears, little feet -->
    <ellipse cx="200" cy="120" rx="44" ry="58"/>
    <ellipse cx="312" cy="120" rx="44" ry="58"/>
    <circle cx="256" cy="288" r="150"/>
    <ellipse cx="196" cy="430" rx="44" ry="32"/>
    <ellipse cx="316" cy="430" rx="44" ry="32"/>
  </g>
  <text x="256" y="340" font-size="200" font-weight="900" text-anchor="middle"
    fill="#ffffff" font-family="Arial, Helvetica, sans-serif">?</text>
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
