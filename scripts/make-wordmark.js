/**
 * Turns the Images/logo.png master into the header-ready Images/logo-wordmark.png.
 *
 * A logo exported from a design tool or image generator is rarely usable as-is
 * in a header: it tends to carry a baked-in background plate, a wide empty
 * margin, a generator watermark in a corner, and far more pixels than a 70px
 * tall header needs. This script normalises any of those into a small,
 * transparent, correctly-matted PNG.
 *
 * It makes no assumption about the logo's colour or its background:
 *
 *   1. If the master already has real transparency, the background is left
 *      alone and the image is only cropped and resized.
 *   2. Otherwise the background colour is measured from the border pixels, and
 *      each pixel's alpha comes from how far it sits from that colour. This
 *      works for light-on-dark, dark-on-light, and any hue.
 *   3. Colour is un-premultiplied against the measured background, so
 *      anti-aliased edges keep the logo's hue instead of drifting towards it.
 *   4. Downscaling is an area average in premultiplied space, which avoids the
 *      dark or light fringing a naive resize produces on transparent edges.
 *
 * Usage:
 *   node scripts/make-wordmark.js [targetWidth] [--preview]
 *
 * `--preview` also writes Images/logo-wordmark.preview.png showing the result
 * composited over the site's real background colours, so a swapped logo can be
 * checked without opening the site.
 */

const fs = require("node:fs");
const path = require("node:path");
const { decode, encode } = require("./lib/png.js");

const ROOT = path.join(__dirname, "..");

/** Header display height is ~70px; 420px leaves headroom for 3x screens. */
const DEFAULT_TARGET_WIDTH = 420;

/** Fraction of the subject's height kept as transparent padding around it. */
const PAD_RATIO = 0.05;

/**
 * How far into the subject's contrast range a pixel must be to become fully
 * opaque. Lower keeps more of the soft glow; higher gives crisper edges.
 */
const OPACITY_KNEE = 0.45;

const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** Median colour of the outermost ring of pixels — i.e. the background plate. */
function measureBackground({ width, height, data }) {
  const channels = [[], [], []];
  const push = (x, y) => {
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c += 1) channels[c].push(data[i + c]);
  };

  const ring = Math.max(1, Math.round(Math.min(width, height) * 0.01));
  for (let x = 0; x < width; x += 1) {
    for (let d = 0; d < ring; d += 1) {
      push(x, d);
      push(x, height - 1 - d);
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let d = 0; d < ring; d += 1) {
      push(d, y);
      push(width - 1 - d, y);
    }
  }

  return channels.map((values) => {
    values.sort((a, b) => a - b);
    return percentile(values, 0.5);
  });
}

function hasRealTransparency({ width, height, data }) {
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 16) transparent += 1;
  return transparent / (width * height) > 0.02;
}

/**
 * Otsu's method: splits the weight histogram into background and subject by
 * maximising between-class variance. Used instead of a border-sampled
 * threshold because a border sample underestimates a vignette or a glow in the
 * middle of the plate, which then gets mistaken for part of the logo.
 */
function otsuThreshold(weights) {
  const histogram = new Float64Array(256);
  for (const w of weights) histogram[w] += 1;

  const total = weights.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let best = -1;
  let threshold = 0;

  for (let t = 0; t < 256; t += 1) {
    backgroundWeight += histogram[t];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundSum += t * histogram[t];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance =
      backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;

    if (variance > best) {
      best = variance;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Labels 8-connected blobs above the threshold, then keeps the ones that
 * belong to the logo.
 *
 * A blob is kept when it is either substantial, or aligned with the largest
 * blob's rows or columns. That keeps the dots on an "i" or a separate icon
 * sitting beside the text, while discarding the small isolated marks that
 * image generators like to stamp into a corner.
 */
function subjectBounds(width, height, weights, threshold) {
  const labels = new Int32Array(width * height);
  const blobs = [];
  const stack = [];

  for (let start = 0; start < labels.length; start += 1) {
    if (labels[start] !== 0 || weights[start] <= threshold) continue;

    const id = blobs.length + 1;
    const blob = { size: 0, minX: width, maxX: -1, minY: height, maxY: -1 };
    labels[start] = id;
    stack.push(start);

    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const y = (index - x) / width;

      blob.size += 1;
      if (x < blob.minX) blob.minX = x;
      if (x > blob.maxX) blob.maxX = x;
      if (y < blob.minY) blob.minY = y;
      if (y > blob.maxY) blob.maxY = y;

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const n = ny * width + nx;
          if (labels[n] !== 0 || weights[n] <= threshold) continue;
          labels[n] = id;
          stack.push(n);
        }
      }
    }
    blobs.push(blob);
  }

  if (!blobs.length) return null;

  blobs.sort((a, b) => b.size - a.size);
  const anchor = blobs[0];
  const totalSize = blobs.reduce((acc, blob) => acc + blob.size, 0);

  const kept = blobs.filter((blob) => {
    if (blob === anchor) return true;
    if (blob.size >= totalSize * 0.01) return true;
    const overlapsColumns = blob.maxX >= anchor.minX && blob.minX <= anchor.maxX;
    const overlapsRows = blob.maxY >= anchor.minY && blob.minY <= anchor.maxY;
    return overlapsColumns || overlapsRows;
  });

  return {
    minX: Math.min(...kept.map((b) => b.minX)),
    maxX: Math.max(...kept.map((b) => b.maxX)),
    minY: Math.min(...kept.map((b) => b.minY)),
    maxY: Math.max(...kept.map((b) => b.maxY)),
    blobs: blobs.length,
    discarded: blobs.length - kept.length,
  };
}

/** Area-average downscale of premultiplied RGBA. */
function resize(pre, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let y = 0; y < dstH; y += 1) {
    const y0 = y * scaleY;
    const y1 = (y + 1) * scaleY;
    for (let x = 0; x < dstW; x += 1) {
      const x0 = x * scaleX;
      const x1 = (x + 1) * scaleX;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let total = 0;

      for (let py = Math.floor(y0); py < Math.min(srcH, Math.ceil(y1)); py += 1) {
        const wy = Math.min(y1, py + 1) - Math.max(y0, py);
        if (wy <= 0) continue;
        for (let px = Math.floor(x0); px < Math.min(srcW, Math.ceil(x1)); px += 1) {
          const wx = Math.min(x1, px + 1) - Math.max(x0, px);
          if (wx <= 0) continue;
          const w = wx * wy;
          const s = (py * srcW + px) * 4;
          r += pre[s] * w;
          g += pre[s + 1] * w;
          b += pre[s + 2] * w;
          a += pre[s + 3] * w;
          total += w;
        }
      }

      const alpha = a / total;
      if (alpha <= 0.0001) continue; // stays fully transparent
      const d = (y * dstW + x) * 4;
      const channel = (sum) => Math.max(0, Math.min(255, Math.round(sum / total / alpha)));
      out[d] = channel(r);
      out[d + 1] = channel(g);
      out[d + 2] = channel(b);
      out[d + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
    }
  }
  return out;
}

function buildWordmark({ source, dest, targetWidth = DEFAULT_TARGET_WIDTH, preview = false, log = () => {} }) {
  const img = decode(fs.readFileSync(source));
  const { width, height, data } = img;

  const preKeyed = hasRealTransparency(img);
  const background = preKeyed ? null : measureBackground(img);

  // Weight = how strongly each pixel belongs to the logo rather than the plate.
  const weights = new Uint8Array(width * height);
  if (preKeyed) {
    for (let p = 0; p < weights.length; p += 1) weights[p] = data[p * 4 + 3];
  } else {
    const [bgR, bgG, bgB] = background;
    for (let p = 0; p < weights.length; p += 1) {
      const i = p * 4;
      weights[p] = Math.max(
        Math.abs(data[i] - bgR),
        Math.abs(data[i + 1] - bgG),
        Math.abs(data[i + 2] - bgB)
      );
    }
  }

  const floor = preKeyed ? 8 : otsuThreshold(weights);

  const box = subjectBounds(width, height, weights, floor);
  if (!box) {
    throw new Error(
      `${path.basename(source)}: could not separate the logo from its background. ` +
        `The image may be a single flat colour, or the logo may sit only in the border region.`
    );
  }

  const subjectH = box.maxY - box.minY + 1;
  const pad = Math.max(2, Math.round(subjectH * PAD_RATIO));
  const cropX = Math.max(0, box.minX - pad);
  const cropY = Math.max(0, box.minY - pad);
  const cropW = Math.min(width, box.maxX + 1 + pad) - cropX;
  const cropH = Math.min(height, box.maxY + 1 + pad) - cropY;

  // Peak contrast inside the subject sets where alpha reaches 1.
  const strengths = [];
  for (let y = box.minY; y <= box.maxY; y += 1) {
    for (let x = box.minX; x <= box.maxX; x += 1) {
      const w = weights[y * width + x];
      if (w > floor) strengths.push(w);
    }
  }
  strengths.sort((a, b) => a - b);
  const peak = percentile(strengths, 0.999);
  const ceil = preKeyed ? 255 : Math.max(floor + 8, floor + OPACITY_KNEE * (peak - floor));

  const pre = new Float32Array(cropW * cropH * 4);
  let opaque = 0;
  let semi = 0;
  let clear = 0;

  for (let y = 0; y < cropH; y += 1) {
    for (let x = 0; x < cropW; x += 1) {
      const i = ((cropY + y) * width + (cropX + x)) * 4;
      let alpha;

      if (preKeyed) {
        alpha = data[i + 3] / 255;
      } else {
        const raw = (weights[(cropY + y) * width + (cropX + x)] - floor) / (ceil - floor);
        alpha = raw <= 0 ? 0 : raw >= 1 ? 1 : Math.pow(raw, 1.25);
      }

      if (alpha >= 1) opaque += 1;
      else if (alpha <= 0) clear += 1;
      else semi += 1;

      const d = (y * cropW + x) * 4;
      if (alpha <= 0) continue;

      for (let c = 0; c < 3; c += 1) {
        let value = data[i + c];
        if (!preKeyed && alpha < 1) {
          // Reverse the compositing the export baked in:
          //   observed = original * a + background * (1 - a)
          value = (value - background[c] * (1 - alpha)) / alpha;
        }
        pre[d + c] = Math.max(0, Math.min(255, value)) * alpha;
      }
      pre[d + 3] = alpha;
    }
  }

  const outWidth = Math.min(targetWidth, cropW);
  const outHeight = Math.max(1, Math.round((cropH * outWidth) / cropW));
  const out = resize(pre, cropW, cropH, outWidth, outHeight);
  fs.writeFileSync(dest, encode({ width: outWidth, height: outHeight, data: out }));

  const cells = cropW * cropH;
  const sourceKB = fs.statSync(source).size / 1024;
  const destKB = fs.statSync(dest).size / 1024;

  log(
    `${path.relative(ROOT, dest).replace(/\\/g, "/")} — ${outWidth}x${outHeight} ` +
      `(${(outWidth / outHeight).toFixed(3)}:1), ${destKB.toFixed(1)} kB from a ` +
      `${sourceKB.toFixed(0)} kB master (${(100 - (100 * destKB) / sourceKB).toFixed(1)}% smaller)`
  );
  log(
    `  ${
      preKeyed
        ? "master already transparent — cropped only"
        : `background rgb(${background.join(",")}), keyed ${floor.toFixed(0)}..${ceil.toFixed(0)}`
    }`
  );
  log(
    `  cropped ${width}x${height} -> ${cropW}x${cropH} from ${box.blobs} blob(s)` +
      `${box.discarded ? `, ${box.discarded} isolated mark(s) discarded` : ""}`
  );
  log(
    `  ${((100 * opaque) / cells).toFixed(1)}% opaque, ${((100 * semi) / cells).toFixed(1)}% soft, ` +
      `${((100 * clear) / cells).toFixed(1)}% transparent`
  );

  if (preview) {
    const previewPath = dest.replace(/\.png$/, ".preview.png");
    writePreview({ width: outWidth, height: outHeight, data: out }, previewPath);
    log(`  preview: ${path.relative(ROOT, previewPath).replace(/\\/g, "/")}`);
  }

  return { width: outWidth, height: outHeight };
}

/** Composites the result over the site's surfaces, plus white as a haze check. */
function writePreview(mark, destPath) {
  const bands = [
    [0x0c, 0x0e, 0x0f],
    [0x15, 0x18, 0x1a],
    [0xff, 0xff, 0xff],
  ];
  const pad = 20;
  const bandH = mark.height + pad * 2;
  const W = mark.width + pad * 2;
  const H = bandH * bands.length;
  const out = Buffer.alloc(W * H * 4);

  bands.forEach((rgb, index) => {
    const top = index * bandH;
    for (let y = 0; y < bandH; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const d = ((top + y) * W + x) * 4;
        out[d] = rgb[0];
        out[d + 1] = rgb[1];
        out[d + 2] = rgb[2];
        out[d + 3] = 255;
      }
    }
    for (let y = 0; y < mark.height; y += 1) {
      for (let x = 0; x < mark.width; x += 1) {
        const s = (y * mark.width + x) * 4;
        const a = mark.data[s + 3] / 255;
        if (a === 0) continue;
        const d = ((top + pad + y) * W + (pad + x)) * 4;
        for (let c = 0; c < 3; c += 1) {
          out[d + c] = Math.round(mark.data[s + c] * a + out[d + c] * (1 - a));
        }
      }
    }
  });

  fs.writeFileSync(destPath, encode({ width: W, height: H, data: out }));
}

module.exports = { buildWordmark, DEFAULT_TARGET_WIDTH };

if (require.main === module) {
  const args = process.argv.slice(2);
  const targetWidth = Number(args.find((a) => /^\d+$/.test(a))) || DEFAULT_TARGET_WIDTH;
  buildWordmark({
    source: path.join(ROOT, "Images", "logo.png"),
    dest: path.join(ROOT, "Images", "logo-wordmark.png"),
    targetWidth,
    preview: args.includes("--preview"),
    log: console.log,
  });
}
