import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(w, h, paint) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y, w, h);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paintIcon(x, y, w) {
  const n = (v) => v / w;
  const px = n(x);
  const py = n(y);
  const dx = px - 0.5;
  const dy = py - 0.5;
  const r = 0.42;
  const inside = dx * dx + dy * dy < r * r;
  if (!inside) return [0, 0, 0, 0];

  const ring = dx * dx + dy * dy > (r - 0.045) * (r - 0.045);
  if (ring) return [232, 196, 104, 255];

  // lightning bolt polygon
  const bolt = [
    [0.52, 0.18],
    [0.30, 0.52],
    [0.46, 0.52],
    [0.40, 0.82],
    [0.70, 0.44],
    [0.52, 0.44],
  ];
  let hit = false;
  for (let i = 0, j = bolt.length - 1; i < bolt.length; j = i++) {
    const [xi, yi] = bolt[i];
    const [xj, yj] = bolt[j];
    const inter = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (inter) hit = !hit;
  }
  if (hit) return [250, 230, 150, 255];
  return [24, 36, 48, 255];
}

function write(name, size) {
  writeFileSync(join(root, 'public', name), png(size, size, paintIcon));
}

write('apple-touch-icon.png', 180);
write('icons/icon-192.png', 192);
write('icons/icon-512.png', 512);
write('favicon.png', 32);
console.log('icons written');
