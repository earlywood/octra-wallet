// One-shot favicon generator: takes assets/favicon-source.png and produces
// pixel-perfect square renders at the standard tab/touch sizes into public/.
// Run manually whenever the source art changes:
//   npm run gen-favicons   (or: node scripts/gen-favicons.mjs)
//
// Center-crops to a square (the source is 1018x828 — wider than tall — and the
// content sits centered). Uses 'nearest' kernel because the art is pixel art:
// box/lanczos resampling smears the chunky edges and makes the tab icon look
// blurry. Nearest preserves the crisp pixel-art look.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = path.join(root, 'assets', 'favicon-source.png');
const out = path.join(root, 'public');

const SIZES = [16, 32, 48, 64, 128, 180, 256];

const meta = await sharp(src).metadata();
const side = Math.min(meta.width ?? 0, meta.height ?? 0);
const left = Math.floor(((meta.width ?? side) - side) / 2);
const top = Math.floor(((meta.height ?? side) - side) / 2);

console.log(`source ${meta.width}x${meta.height} → cropping ${side}x${side} at (${left}, ${top})`);

for (const s of SIZES) {
  const file = path.join(out, `favicon-${s}.png`);
  await sharp(src)
    .extract({ left, top, width: side, height: side })
    .resize(s, s, { kernel: 'nearest' })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`wrote favicon-${s}.png`);
}

// Default favicon.png as the 256 variant (used by 'rel=icon' fallback,
// bookmarks, and platforms that just want one file).
await sharp(src)
  .extract({ left, top, width: side, height: side })
  .resize(256, 256, { kernel: 'nearest' })
  .png({ compressionLevel: 9 })
  .toFile(path.join(out, 'favicon.png'));
console.log('wrote favicon.png (256)');
