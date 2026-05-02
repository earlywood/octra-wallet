// Generates the extension's PNG icons (16/48/128) — Octra's hollow blue ring.
// No deps: hand-rolled PNG encoder + sub-pixel anti-aliasing.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'public', 'icons');

const BG = [22, 28, 37];           // matches popup --bg (#161c25)
const FG = [0, 0, 219];            // octra brand #0000DB
const SIZES = [16, 48, 128];

function renderRing(size) {
  const SS = 4;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  // Match the SVG: stroke = 16% of size, radius hits edge minus tiny pad
  const stroke = Math.max(2, Math.round(size * 0.16));
  const rOuter = size / 2 - Math.max(1, Math.round(size * 0.04));
  const rInner = rOuter - stroke;
  const buf = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x - 0.5 + (sx + 0.5) / SS;
          const py = y - 0.5 + (sy + 0.5) / SS;
          const d = Math.hypot(px - cx, py - cy);
          if (d <= rOuter && d >= rInner) cov++;
        }
      }
      const a = cov / (SS * SS);
      const i = (y * size + x) * 3;
      buf[i + 0] = Math.round(BG[0] + (FG[0] - BG[0]) * a);
      buf[i + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * a);
      buf[i + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * a);
    }
  }
  return buf;
}

function crc32(b) {
  let c = ~0 >>> 0;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(typeStr, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const type = Buffer.from(typeStr, 'ascii');
  const all = Buffer.concat([type, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(all), 0);
  return Buffer.concat([len, type, data, crc]);
}

function encodePng(rgb, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type 2 = RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // each scanline prefixed with filter byte 0
  const rowLen = size * 3;
  const raw = Buffer.alloc((rowLen + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (rowLen + 1)] = 0;
    rgb.copy(raw, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(outDir, { recursive: true });
for (const s of SIZES) {
  const png = encodePng(renderRing(s), s);
  fs.writeFileSync(path.join(outDir, `icon${s}.png`), png);
  console.log(`wrote icon${s}.png (${png.length} bytes)`);
}
