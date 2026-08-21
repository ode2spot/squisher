// One-shot generator for src/icons/icon-{16,32,48,128}.png — a dark rounded
// tile with three meter bars, green/amber/red like a hardware level meter.
// Deterministic; the PNGs are committed, so this only needs re-running if
// the design changes: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [0x16, 0x18, 0x1c];
const GREEN = [0x3d, 0xdc, 0x84];
const AMBER = [0xff, 0xb0, 0x20];
const RED = [0xff, 0x4d, 0x4f];

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size / 5;
  const margin = Math.max(2, Math.round(size / 6));
  const inner = size - 2 * margin;
  const barHeights = [0.62, 0.92, 0.75]; // fractions of inner height
  const barW = inner / 4.4;
  const gap = (inner - 3 * barW) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded-rect mask
      const cx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const cy = Math.max(radius - y, y - (size - 1 - radius), 0);
      const idx = (y * size + x) * 4;
      if (cx * cx + cy * cy > radius * radius) continue; // transparent corner
      let [r, g, b] = BG;
      const ix = x - margin;
      const iy = y - margin;
      if (ix >= 0 && ix < inner && iy >= 0 && iy < inner) {
        const bar = Math.floor(ix / (barW + gap));
        const inBar = bar >= 0 && bar < 3 && ix - bar * (barW + gap) < barW;
        const frac = 1 - iy / inner; // 0 bottom .. 1 top
        if (inBar && frac <= (barHeights[bar] ?? 0)) {
          if (frac > 0.82) [r, g, b] = RED;
          else if (frac > 0.6) [r, g, b] = AMBER;
          else [r, g, b] = GREEN;
        }
      }
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

await mkdir('src/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await writeFile(`src/icons/icon-${size}.png`, drawIcon(size));
  console.log(`wrote src/icons/icon-${size}.png`);
}
