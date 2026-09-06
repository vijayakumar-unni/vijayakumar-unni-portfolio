/**
 * Writes the site icon from the shared monogram geometry:
 *
 *   Images/favicon.svg  primary icon — crisp at every size, well under 1 kB
 *   Images/favicon.png  180x180 raster for Safari and the Apple touch icon
 *
 * The PNG is rasterised here rather than by an SVG renderer so the whole
 * pipeline stays dependency-free. Shapes are supersampled for anti-aliasing.
 *
 * Usage: node scripts/make-favicon.js [--preview]
 */

const fs = require("node:fs");
const path = require("node:path");
const { encode } = require("./lib/png.js");
const monogram = require("./lib/monogram.js");

const ROOT = path.join(__dirname, "..");
const PNG_SIZE = 180;

/** Samples per pixel per axis. 4 gives 16 samples — plenty for flat shapes. */
const SUPERSAMPLE = 4;

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const mix = (from, to, t) => from.map((c, i) => c + (to[i] - from[i]) * Math.max(0, Math.min(1, t)));

/** Crossing-number point-in-polygon test. */
function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < xi + ((y - yi) / (yj - yi)) * (xj - xi)) inside = !inside;
  }
  return inside;
}

function inRoundedRect(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
  const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function rasterise(size) {
  const {
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
  } = monogram;

  const tileRgb = hexToRgb(TILE.fill);
  const goldFrom = hexToRgb(GOLD.from);
  const goldTo = hexToRgb(GOLD.to);
  const copperFrom = hexToRgb(COPPER.from);
  const copperTo = hexToRgb(COPPER.to);

  // Layers are evaluated back to front; each contributes coverage in [0,1].
  const layers = [
    {
      hit: (x, y) => inRoundedRect(x, y, 0, 0, BOX, BOX, TILE.radius),
      colour: () => tileRgb,
    },
    {
      hit: (x, y) => inPolygon(x, y, V_SHAPE),
      colour: (_, y) =>
        mix(goldFrom, goldTo, (y - V_GRADIENT_SPAN[0]) / (V_GRADIENT_SPAN[1] - V_GRADIENT_SPAN[0])),
    },
    {
      hit: (x, y) =>
        STEMS.some((s) =>
          inRoundedRect(
            x,
            y,
            s.x0 - STEM_HALO,
            STEM_Y[0] - STEM_HALO,
            s.x1 + STEM_HALO,
            STEM_Y[1] + STEM_HALO,
            STEM_RADIUS + STEM_HALO
          )
        ),
      colour: () => tileRgb,
    },
    {
      hit: (x, y) =>
        STEMS.some((s) => inRoundedRect(x, y, s.x0, STEM_Y[0], s.x1, STEM_Y[1], STEM_RADIUS)),
      colour: (_, y) =>
        mix(
          copperFrom,
          copperTo,
          (y - STEM_GRADIENT_SPAN[0]) / (STEM_GRADIENT_SPAN[1] - STEM_GRADIENT_SPAN[0])
        ),
    },
  ];

  const data = Buffer.alloc(size * size * 4);
  const scale = BOX / size;
  const step = 1 / SUPERSAMPLE;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      // Accumulate premultiplied colour so partial coverage blends correctly.
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = (px + (sx + 0.5) * step) * scale;
          const y = (py + (sy + 0.5) * step) * scale;

          let sr = 0;
          let sg = 0;
          let sb = 0;
          let sa = 0;
          for (const layer of layers) {
            if (!layer.hit(x, y)) continue;
            const [lr, lg, lb] = layer.colour(x, y);
            sr = lr;
            sg = lg;
            sb = lb;
            sa = 1;
          }

          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }

      if (a === 0) continue;
      const alpha = a / samples;
      const d = (py * size + px) * 4;
      data[d] = Math.round(r / a);
      data[d + 1] = Math.round(g / a);
      data[d + 2] = Math.round(b / a);
      data[d + 3] = Math.round(alpha * 255);
    }
  }

  return { width: size, height: size, data };
}

/** Contact sheet at real browser sizes, so legibility can be judged. */
function writePreview(icon, destPath) {
  const sizes = [16, 32, 48, 64, 128];
  const gap = 14;
  const W = sizes.reduce((acc, s) => acc + s + gap, gap);
  const H = Math.max(...sizes) + gap * 2;
  const data = Buffer.alloc(W * H * 4);

  // Split backdrop: dark on the left half, light on the right, to check both.
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const d = (y * W + x) * 4;
      const light = x > W / 2;
      data[d] = light ? 0xf2 : 0x0c;
      data[d + 1] = light ? 0xf2 : 0x0e;
      data[d + 2] = light ? 0xf4 : 0x0f;
      data[d + 3] = 255;
    }
  }

  let cursor = gap;
  for (const size of sizes) {
    const scale = icon.width / size;
    const top = Math.round((H - size) / 2);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (let iy = Math.floor(y * scale); iy < Math.min(icon.height, Math.ceil((y + 1) * scale)); iy += 1) {
          for (let ix = Math.floor(x * scale); ix < Math.min(icon.width, Math.ceil((x + 1) * scale)); ix += 1) {
            const s = (iy * icon.width + ix) * 4;
            const sa = icon.data[s + 3] / 255;
            r += icon.data[s] * sa;
            g += icon.data[s + 1] * sa;
            b += icon.data[s + 2] * sa;
            a += sa;
            n += 1;
          }
        }
        if (!n || a === 0) continue;
        const alpha = a / n;
        const d = ((top + y) * W + cursor + x) * 4;
        data[d] = Math.round(r / a * alpha + data[d] * (1 - alpha));
        data[d + 1] = Math.round(g / a * alpha + data[d + 1] * (1 - alpha));
        data[d + 2] = Math.round(b / a * alpha + data[d + 2] * (1 - alpha));
      }
    }
    cursor += size + gap;
  }

  fs.writeFileSync(destPath, encode({ width: W, height: H, data }));
}

function buildFavicon({ dir = path.join(ROOT, "Images"), preview = false, log = () => {} } = {}) {
  const svgPath = path.join(dir, "favicon.svg");
  const pngPath = path.join(dir, "favicon.png");

  fs.writeFileSync(svgPath, monogram.toSvg());
  const icon = rasterise(PNG_SIZE);
  fs.writeFileSync(pngPath, encode(icon));

  log(`Images/favicon.svg — ${(fs.statSync(svgPath).size / 1024).toFixed(2)} kB`);
  log(`Images/favicon.png — ${PNG_SIZE}x${PNG_SIZE}, ${(fs.statSync(pngPath).size / 1024).toFixed(1)} kB`);

  if (preview) {
    const previewPath = path.join(dir, "favicon.preview.png");
    writePreview(icon, previewPath);
    log(`  preview: Images/favicon.preview.png`);
  }

  return { svgPath, pngPath, size: PNG_SIZE };
}

module.exports = { buildFavicon, PNG_SIZE };

if (require.main === module) {
  buildFavicon({ preview: process.argv.includes("--preview"), log: console.log });
}
