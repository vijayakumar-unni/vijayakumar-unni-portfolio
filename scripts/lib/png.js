/** Minimal PNG decode/encode using only node:zlib. RGBA8, non-interlaced. */
const zlib = require("node:zlib");

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decode(buffer) {
  if (!buffer.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");

  let offset = 8;
  let ihdr = null;
  const idat = [];
  let palette = null;
  let trns = null;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      ihdr = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === "IDAT") idat.push(body);
    else if (type === "PLTE") palette = Buffer.from(body);
    else if (type === "tRNS") trns = Buffer.from(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }

  if (!ihdr) throw new Error("no IHDR");
  if (ihdr.depth !== 8) throw new Error(`unsupported bit depth ${ihdr.depth}`);
  if (ihdr.interlace !== 0) throw new Error("interlaced PNG not supported");

  const channelsFor = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsFor[ihdr.colorType];
  if (!channels) throw new Error(`unsupported colour type ${ihdr.colorType}`);

  const { width, height } = ihdr;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const rowBytes = width * bpp;
  const lines = Buffer.alloc(height * rowBytes);

  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    const row = raw.subarray(src, src + rowBytes);
    src += rowBytes;
    const out = lines.subarray(y * rowBytes, (y + 1) * rowBytes);
    const prev = y > 0 ? lines.subarray((y - 1) * rowBytes, y * rowBytes) : null;

    for (let i = 0; i < rowBytes; i += 1) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      const x = row[i];
      switch (filter) {
        case 0: out[i] = x; break;
        case 1: out[i] = (x + a) & 0xff; break;
        case 2: out[i] = (x + b) & 0xff; break;
        case 3: out[i] = (x + ((a + b) >> 1)) & 0xff; break;
        case 4: out[i] = (x + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`bad filter ${filter}`);
      }
    }
  }

  // Normalise everything to RGBA8.
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0, n = width * height; i < n; i += 1) {
    const s = i * bpp;
    const d = i * 4;
    switch (ihdr.colorType) {
      case 0:
        rgba[d] = rgba[d + 1] = rgba[d + 2] = lines[s];
        break;
      case 2:
        rgba[d] = lines[s]; rgba[d + 1] = lines[s + 1]; rgba[d + 2] = lines[s + 2];
        break;
      case 3: {
        const p = lines[s] * 3;
        rgba[d] = palette[p]; rgba[d + 1] = palette[p + 1]; rgba[d + 2] = palette[p + 2];
        rgba[d + 3] = trns && lines[s] < trns.length ? trns[lines[s]] : 255;
        break;
      }
      case 4:
        rgba[d] = rgba[d + 1] = rgba[d + 2] = lines[s];
        rgba[d + 3] = lines[s + 1];
        break;
      case 6:
        rgba[d] = lines[s]; rgba[d + 1] = lines[s + 1];
        rgba[d + 2] = lines[s + 2]; rgba[d + 3] = lines[s + 3];
        break;
    }
  }

  return { width, height, data: rgba, colorType: ihdr.colorType };
}

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "ascii");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

function encode({ width, height, data }) {
  const rowBytes = width * 4;
  const raw = Buffer.alloc(height * (rowBytes + 1));

  for (let y = 0; y < height; y += 1) {
    const row = data.subarray(y * rowBytes, (y + 1) * rowBytes);
    const prev = y > 0 ? data.subarray((y - 1) * rowBytes, y * rowBytes) : null;

    // Pick between None and Paeth per line by lowest absolute sum.
    const none = row;
    const pae = Buffer.alloc(rowBytes);
    let sumNone = 0;
    let sumPaeth = 0;
    for (let i = 0; i < rowBytes; i += 1) {
      const a = i >= 4 ? row[i - 4] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= 4 ? prev[i - 4] : 0;
      pae[i] = (row[i] - paeth(a, b, c)) & 0xff;
      sumNone += none[i] < 128 ? none[i] : 256 - none[i];
      sumPaeth += pae[i] < 128 ? pae[i] : 256 - pae[i];
    }

    const usePaeth = sumPaeth < sumNone;
    const base = y * (rowBytes + 1);
    raw[base] = usePaeth ? 4 : 0;
    (usePaeth ? pae : none).copy(raw, base + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Reads just the IHDR dimensions, without inflating the pixel data. */
function readSize(buffer) {
  if (!buffer.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  if (buffer.toString("ascii", 12, 16) !== "IHDR") throw new Error("PNG is missing IHDR");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

module.exports = { decode, encode, readSize };
