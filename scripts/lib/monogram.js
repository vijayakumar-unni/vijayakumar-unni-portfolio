/**
 * The "VU" monogram used as the site icon.
 *
 * Geometry lives here as plain numbers in a 100x100 box so that the SVG and
 * the rasterised PNGs are generated from one definition and cannot drift.
 * Everything is straight-edged on purpose: a chevron holds its shape at 16px,
 * where the curves of the signature wordmark turn to mush.
 */

const BOX = 100;

/** Dark tile behind the mark, so it reads on light and dark tab strips alike. */
const TILE = { radius: 22, fill: "#14171a" };

/**
 * Outer V. Listed as a single ring: down the left outer edge to the point,
 * back up the right outer edge, then the inner edge in reverse.
 */
const V_SHAPE = [
  [13, 14],
  [50, 87],
  [87, 14],
  [68, 14],
  [50, 57],
  [32, 14],
];

/**
 * Inner stems that turn the V into a VU. They stop just short of the V's inner
 * notch: any deeper and they read as pencil tips rather than nested strokes.
 */
const STEM_Y = [20, 55];
const STEMS = [
  { x0: 39.5, x1: 47.5 },
  { x0: 52.5, x1: 60.5 },
];
const STEM_RADIUS = 1.5;

/** Dark gap drawn under the stems so they stay legible over the V. */
const STEM_HALO = 2.4;

const GOLD = { from: "#f7e2a8", to: "#bd873a" };
const COPPER = { from: "#e3ac7e", to: "#8d4d2a" };

/**
 * Vertical span each gradient is mapped across. Derived from the geometry so
 * that retuning a shape keeps its shading aligned with it.
 */
const V_GRADIENT_SPAN = [
  Math.min(...V_SHAPE.map(([, y]) => y)),
  Math.max(...V_SHAPE.map(([, y]) => y)),
];
const STEM_GRADIENT_SPAN = STEM_Y;

function toSvg() {
  const stemRects = STEMS.map(
    ({ x0, x1 }) =>
      `<rect x="${x0}" y="${STEM_Y[0]}" width="${x1 - x0}" height="${STEM_Y[1] - STEM_Y[0]}" ` +
      `rx="${STEM_RADIUS}" fill="url(#copper)"/>`
  );

  const haloRects = STEMS.map(
    ({ x0, x1 }) =>
      `<rect x="${x0 - STEM_HALO}" y="${STEM_Y[0] - STEM_HALO}" ` +
      `width="${x1 - x0 + STEM_HALO * 2}" height="${STEM_Y[1] - STEM_Y[0] + STEM_HALO * 2}" ` +
      `rx="${STEM_RADIUS + STEM_HALO}" fill="${TILE.fill}"/>`
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}" role="img" aria-label="VU">
  <defs>
    <linearGradient id="gold" x1="0" y1="${V_GRADIENT_SPAN[0]}" x2="0" y2="${V_GRADIENT_SPAN[1]}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${GOLD.from}"/>
      <stop offset="1" stop-color="${GOLD.to}"/>
    </linearGradient>
    <linearGradient id="copper" x1="0" y1="${STEM_GRADIENT_SPAN[0]}" x2="0" y2="${STEM_GRADIENT_SPAN[1]}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${COPPER.from}"/>
      <stop offset="1" stop-color="${COPPER.to}"/>
    </linearGradient>
  </defs>
  <rect width="${BOX}" height="${BOX}" rx="${TILE.radius}" fill="${TILE.fill}"/>
  <path d="${V_SHAPE.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ")} Z" fill="url(#gold)"/>
  ${haloRects.join("\n  ")}
  ${stemRects.join("\n  ")}
</svg>
`;
}

module.exports = {
  BOX,
  TILE,
  V_SHAPE,
  STEM_Y,
  STEMS,
  STEM_RADIUS,
  STEM_HALO,
  GOLD,
  COPPER,
  V_GRADIENT_SPAN,
  STEM_GRADIENT_SPAN,
  toSvg,
};
