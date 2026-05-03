// One-shot icon generator. Produces the full set of branded icons used by
// BOTH projects (claim-site favicons + extension manifest icons) from the
// same source ski mask art. Run with `npm run gen-icons` from claim-site/.
//
// Composite: blue Octra hollow ring on the outside, AC ski mask peeking out
// from the middle (clipped to a circle so it sits inside the ring's hole).
// The ski mask source is wider than tall so we center-crop to square first.
//
// Outputs:
//   claim-site/public/favicon-{16,32,48,64,128,180,256}.png  + favicon.png
//   ../extension/public/icons/icon{16,48,128}.png

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repoRoot = path.resolve(root, '..');

const SOURCE = path.join(root, 'assets', 'favicon-source.png');
const CLAIM_OUT = path.join(root, 'public');
const EXT_OUT = path.join(repoRoot, 'extension', 'public', 'icons');

const RING_BLUE = '#0000DB';
const SIZES_FAVICON = [16, 32, 48, 64, 128, 180, 256];
const SIZES_EXT = [16, 48, 128];

// Source is 1018×828 — center-crop to a square before resizing
const meta = await sharp(SOURCE).metadata();
const sourceSide = Math.min(meta.width ?? 0, meta.height ?? 0);
const sourceLeft = Math.floor(((meta.width ?? sourceSide) - sourceSide) / 2);
const sourceTop = Math.floor(((meta.height ?? sourceSide) - sourceSide) / 2);

console.log(`source ${meta.width}×${meta.height} → cropping ${sourceSide}² at (${sourceLeft}, ${sourceTop})`);

async function makeIcon(size, outPath) {
  // Geometry: ring stroke is 16% of total size, sitting just inside the
  // canvas edge. Mask fills the inner circle with a tiny overflow (1.04×) so
  // it nudges right up against the ring inner edge for the "peeking out"
  // feel rather than floating in empty space.
  const stroke = Math.max(2, Math.round(size * 0.16));
  const ringR = size / 2 - Math.max(1, Math.round(size * 0.03));
  const innerR = ringR - stroke;
  const maskSize = Math.round(innerR * 2 * 1.04);
  const maskOffset = Math.round((size - maskSize) / 2);

  // Step 1: prepare the mask art — center-crop, scale to maskSize, clip to circle
  const circleMaskSvg = Buffer.from(
    `<svg width="${maskSize}" height="${maskSize}" xmlns="http://www.w3.org/2000/svg">
       <circle cx="${maskSize / 2}" cy="${maskSize / 2}" r="${maskSize / 2}" fill="white"/>
     </svg>`,
  );
  const skiMask = await sharp(SOURCE, { failOn: 'none' })
    .extract({ left: sourceLeft, top: sourceTop, width: sourceSide, height: sourceSide })
    .resize(maskSize, maskSize, { kernel: 'nearest' })
    .composite([{ input: circleMaskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Step 2: render the blue Octra ring as SVG, rasterize to PNG
  const ringSvg = Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
       <circle cx="${size / 2}" cy="${size / 2}" r="${ringR - stroke / 2}"
               stroke="${RING_BLUE}" stroke-width="${stroke}" fill="none" />
     </svg>`,
  );
  const ringPng = await sharp(ringSvg).png().toBuffer();

  // Step 3: composite onto a transparent canvas — mask underneath, ring on top
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: skiMask, top: maskOffset, left: maskOffset },
      { input: ringPng, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

fs.mkdirSync(CLAIM_OUT, { recursive: true });
fs.mkdirSync(EXT_OUT, { recursive: true });

console.log('\n--- claim-site favicons ---');
for (const s of SIZES_FAVICON) {
  const out = path.join(CLAIM_OUT, `favicon-${s}.png`);
  await makeIcon(s, out);
  console.log(`  favicon-${s}.png`);
}
// default favicon = 256
await makeIcon(256, path.join(CLAIM_OUT, 'favicon.png'));
console.log('  favicon.png (256)');

console.log('\n--- extension manifest icons ---');
for (const s of SIZES_EXT) {
  const out = path.join(EXT_OUT, `icon${s}.png`);
  await makeIcon(s, out);
  console.log(`  icon${s}.png`);
}

console.log('\ndone.');
